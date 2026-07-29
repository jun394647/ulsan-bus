/**
 * 0단계 검증 스크립트 — 계획서의 "데이터 검증" 단계.
 *
 * 문서에 없는 실제 데이터 형태를 눈으로 확인한다. 앱 코드를 쓰기 전에
 * 여기서 막히는 게 있으면 설계를 바꿔야 한다.
 *
 * 실행: pnpm verify:bis
 *
 * API 호출량이 트래픽 한도(개발계정 1,000회/일)에 잡히므로 호출 수를 최소로 유지한다.
 * 마지막에 이번 실행이 몇 회를 썼는지 출력한다.
 */

import { bis, getCallCount } from '../src/lib/bis/client'
import { parseRouteName } from '../src/lib/bis/parse'
import type { ArrivalRow, RouteDetailRow } from '../src/lib/bis/types'

/** 노선 상세를 조회할 최대 노선 수. 트래픽 절약. */
const MAX_ROUTES_TO_PROBE = 5

const line = (char = '─') => console.log(char.repeat(64))
const section = (title: string) => {
  console.log()
  line('━')
  console.log(`  ${title}`)
  line('━')
}

function summarizeLengths(values: string[], label: string) {
  const lengths = new Map<number, number>()
  for (const v of values) {
    const len = String(v).length
    lengths.set(len, (lengths.get(len) ?? 0) + 1)
  }
  const sorted = [...lengths.entries()].sort((a, b) => b[1] - a[1])
  console.log(
    `  ${label} 자릿수 분포: ${sorted.map(([len, n]) => `${len}자리 ${n}개`).join(', ')}`,
  )
}

async function main() {
  section('1. 정류장 목록 (BusStopInfo.xo)')

  const stops = await bis.allStops()
  console.log(`  총 ${stops.length.toLocaleString()}개`)
  console.log('  샘플 3건:')
  for (const s of stops.slice(0, 3)) {
    console.log(`    STOPID=${s.STOPID}  STOPNAME=${s.STOPNAME}  STOPREMARK=${s.STOPREMARK ?? '(없음)'}`)
  }
  summarizeLengths(stops.map((s) => s.STOPID), 'STOPID')

  // 동명 정류장은 방면 역산(PRESENTSTOPNM이 이름 기반)의 정확도를 떨어뜨린다.
  const byName = new Map<string, number>()
  for (const s of stops) {
    byName.set(s.STOPNAME, (byName.get(s.STOPNAME) ?? 0) + 1)
  }
  const duplicated = [...byName.entries()].filter(([, n]) => n > 1)
  const duplicatedStopCount = duplicated.reduce((sum, [, n]) => sum + n, 0)
  console.log(
    `  동명 정류장: ${duplicated.length}개 이름이 중복 → 정류장 ${duplicatedStopCount}개 (전체의 ${((duplicatedStopCount / stops.length) * 100).toFixed(1)}%)`,
  )
  console.log(
    `    가장 많이 겹치는 이름: ${[...duplicated].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n}(${c})`).join(', ') || '(없음)'}`,
  )
  console.log(
    `  ※ 이 비율이 높으면 PRESENTSTOPNM 기반 방면 역산이 모호해진다 (아래 4번 참조)`,
  )

  const remarkFilled = stops.filter((s) => s.STOPREMARK && String(s.STOPREMARK).trim()).length
  console.log(
    `  STOPREMARK 채워진 비율: ${((remarkFilled / stops.length) * 100).toFixed(1)}%  (좌표 퍼지 매칭의 보조 키로 쓸 수 있는지 판단)`,
  )

  section('2. 노선 목록 (RouteInfo.xo) — BRTID 구조')

  const routes = await bis.allRoutes()
  console.log(`  총 ${routes.length.toLocaleString()}개`)
  console.log('  샘플 5건:')
  for (const r of routes.slice(0, 5)) {
    const parsed = parseRouteName(r.BRTNAME)
    console.log(
      `    BRTID=${r.BRTID}  BRTNO=${r.BRTNO}  BRTNAME=${r.BRTNAME}` +
        `  → 번호=${parsed.number} 방면=${parsed.direction ?? '(없음)'}  CLASS=${r.CLASS} DIRECTION=${r.DIRECTION}`,
    )
  }
  summarizeLengths(routes.map((r) => r.BRTID), 'BRTID')

  // BusTimetable.xo의 routeNo를 BRTID 어디에서 뽑아야 하는지 확인한다.
  console.log('\n  BRTID 안에서 BRTNO가 나타나는 위치:')
  const offsets = new Map<string, number>()
  for (const r of routes) {
    const id = String(r.BRTID)
    const no = String(r.BRTNO)
    const idx = id.indexOf(no.padStart(4, '0'))
    const key = idx >= 0 ? `${idx}번째 자리(0채움 4자리)` : id.includes(no) ? `${id.indexOf(no)}번째 자리(그대로)` : '찾지 못함'
    offsets.set(key, (offsets.get(key) ?? 0) + 1)
  }
  for (const [key, n] of [...offsets.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${key}: ${n}개`)
  }

  const withDirection = routes.filter((r) => parseRouteName(r.BRTNAME).direction).length
  console.log(
    `\n  방면 표기가 있는 노선: ${withDirection}/${routes.length} (${((withDirection / routes.length) * 100).toFixed(1)}%)`,
  )

  section('3. 도착정보 (getBusArrivalInfo.xo) — ARRIVALTIME 단위')

  // 도착 정보가 실제로 있는 정류장을 찾을 때까지 몇 곳을 시도한다.
  let probedStopId = ''
  let arrivals: ArrivalRow[] = []
  for (const stop of stops.slice(0, 8)) {
    const rows = await bis.arrivals(String(stop.STOPID))
    if (rows.length > 0) {
      probedStopId = String(stop.STOPID)
      arrivals = rows
      console.log(`  조회 정류장: ${stop.STOPNAME} (${probedStopId})`)
      break
    }
  }

  if (arrivals.length === 0) {
    console.log('  ⚠ 도착 정보가 있는 정류장을 찾지 못했습니다.')
    console.log('    운행 시간대(06~23시)에 다시 실행하세요.')
  } else {
    console.log(`  도착 예정 ${arrivals.length}건:`)
    for (const a of arrivals) {
      console.log(
        `    ${a.ROUTENM}  ARRIVALTIME=${a.ARRIVALTIME}  PREVSTOPCNT=${a.PREVSTOPCNT}` +
          `  현재위치=${a.PRESENTSTOPNM}  차량=${a.VEHICLENO}`,
      )
    }

    // 단위 추정: 남은 정류장 수와 대조한다.
    // 정류장 간 이동은 대략 60~120초다. ARRIVALTIME/PREVSTOPCNT 비율로 판단한다.
    const ratios = arrivals
      .map((a) => ({ t: Number(a.ARRIVALTIME), c: Number(a.PREVSTOPCNT) }))
      .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.c) && r.c > 0)
      .map((r) => r.t / r.c)

    if (ratios.length > 0) {
      const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
      console.log(`\n  정류장당 평균 ARRIVALTIME: ${avg.toFixed(1)}`)
      console.log(
        avg > 20
          ? '  → 단위는 [초]로 보입니다 (정류장당 20 초과).'
          : '  → 단위는 [분]으로 보입니다 (정류장당 20 이하).',
      )
      console.log('  ※ 정류장 전광판과 직접 대조해 최종 확인하세요.')
    }
  }

  section('4. 방면 역산 가능성 (BRSSEQNO + PRESENTSTOPNM)')

  if (arrivals.length === 0) {
    console.log('  도착 정보가 없어 건너뜁니다.')
  } else {
    console.log('  같은 정류장에 오는 각 노선에 대해, 버스의 현재 위치를')
    console.log('  노선 경유 목록에서 유일하게 특정할 수 있는지 확인합니다.\n')

    const uniqueRouteIds = [...new Set(arrivals.map((a) => String(a.ROUTEID)))].slice(
      0,
      MAX_ROUTES_TO_PROBE,
    )

    let resolvable = 0
    let ambiguous = 0

    for (const routeId of uniqueRouteIds) {
      let detail: RouteDetailRow[]
      try {
        detail = await bis.routeDetail(routeId)
      } catch (error) {
        console.log(`  [${routeId}] 노선 상세 조회 실패: ${(error as Error).message}`)
        continue
      }

      const arrival = arrivals.find((a) => String(a.ROUTEID) === routeId)!
      const presentName = String(arrival.PRESENTSTOPNM).trim()

      // 현재 위치 이름이 이 노선 경유 목록에 몇 번 등장하는가?
      const matches = detail.filter((d) => String(d.STOPNM).trim() === presentName)
      // 조회 정류장 자신의 순번
      const self = detail.find((d) => String(d.STOPID) === probedStopId)

      const seqs = matches.map((m) => m.BRSSEQNO).join(', ')
      const status =
        matches.length === 1 ? '✓ 유일' : matches.length === 0 ? '✗ 목록에 없음' : `△ ${matches.length}곳 중복`

      if (matches.length === 1) resolvable++
      else ambiguous++

      console.log(
        `  [${arrival.ROUTENM}] 경유 ${detail.length}개 정류장 / 현재위치 "${presentName}" → ${status}` +
          (seqs ? ` (순번 ${seqs})` : '') +
          (self ? ` / 조회정류장 순번 ${self.BRSSEQNO}` : ' / 조회정류장을 목록에서 못 찾음'),
      )
    }

    console.log(
      `\n  결과: 역산 가능 ${resolvable}건, 모호 ${ambiguous}건 (표본 ${uniqueRouteIds.length}개 노선)`,
    )
    console.log('  ※ 표본이 작습니다. 순환노선이 지나는 정류장에서 다시 확인하면 더 정확합니다.')
    console.log('    (참고 레포가 예로 든 케이스: 울산과학기술원 40234번 정류장의 337번)')
  }

  section('요약')
  console.log(`  이번 실행이 소비한 API 호출: ${getCallCount()}회`)
  console.log('  개발계정 일일 한도: 1,000회')
  console.log()
  console.log('  다음 확인 사항:')
  console.log('   - ARRIVALTIME 단위를 정류장 전광판과 대조')
  console.log('   - 국토부 좌표 데이터를 받아 STOPID 매칭률 측정 (scripts/build-stops.ts)')
}

main().catch((error) => {
  console.error('\n✗ 검증 실패:', error instanceof Error ? error.message : error)
  if (error?.cause) console.error('  원인:', error.cause)
  process.exit(1)
})
