/**
 * 0단계 검증 — TAGO 단독 스펙 + 울산 BIS와의 교차 비교.
 *
 * 이 스크립트가 답해야 할 질문:
 *  1. 울산 도시코드는 무엇인가
 *  2. TAGO가 울산 정류소를 몇 개, 어떤 좌표 형식으로 주는가
 *  3. BIS STOPID와 TAGO 정류소를 매칭할 수 있는가  ← 프로젝트 최대 리스크
 *  4. 같은 정류장의 도착정보가 두 소스에서 같게 나오는가
 *
 * 실행: pnpm verify:tago
 */

import { bis, getCallCount as getBisCalls } from '../src/lib/bis/client'
import { tago, getCallCount as getTagoCalls } from '../src/lib/tago/client'
import { parseRouteName } from '../src/lib/bis/parse'
import type { TagoStop } from '../src/lib/tago/types'
import type { StopRow } from '../src/lib/bis/types'

/** 도착정보를 비교해볼 정류장 수. 트래픽 절약. */
const ARRIVAL_COMPARE_SAMPLES = 3

const line = (char = '─') => console.log(char.repeat(70))
const section = (title: string) => {
  console.log()
  line('━')
  console.log(`  ${title}`)
  line('━')
}

const pct = (n: number, total: number) =>
  total === 0 ? '0.0%' : `${((n / total) * 100).toFixed(1)}%`

/** 정류소 번호만 남긴다. nodeid가 "ULB40234" 같은 형태일 때 숫자를 뽑기 위함. */
const digitsOf = (value: unknown) => String(value ?? '').replace(/\D/g, '')

async function fetchAllTagoStops(cityCode: string | number): Promise<TagoStop[]> {
  const all: TagoStop[] = []
  const PAGE_SIZE = 1000

  for (let page = 1; page <= 20; page++) {
    const rows = await tago.stops(cityCode, page, PAGE_SIZE)
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  return all
}

async function main() {
  section('1. 도시코드 조회 (getCtyCodeList)')

  const cities = await tago.cityCodes()
  const ulsan = cities.find((c) => String(c.cityname).includes('울산'))

  if (!ulsan) {
    console.log('  ⚠ 울산을 찾지 못했습니다. 전체 목록:')
    for (const c of cities.slice(0, 30)) {
      console.log(`    ${c.citycode}  ${c.cityname}`)
    }
    throw new Error('울산 도시코드를 찾을 수 없습니다.')
  }

  const cityCode = String(ulsan.citycode)
  console.log(`  ✓ 울산 도시코드: ${cityCode} (${ulsan.cityname})`)
  console.log(`    전체 ${cities.length}개 도시 중`)

  section('2. TAGO 정류소 목록 (getSttnNoList)')

  const tagoStops = await fetchAllTagoStops(cityCode)
  console.log(`  총 ${tagoStops.length.toLocaleString()}개`)

  if (tagoStops.length === 0) {
    throw new Error('정류소를 하나도 받지 못했습니다. cityCode를 확인하세요.')
  }

  console.log('  샘플 3건:')
  for (const s of tagoStops.slice(0, 3)) {
    console.log(
      `    nodeid=${s.nodeid}  nodeno=${s.nodeno ?? '(없음)'}  ${s.nodenm}` +
        `  (${s.gpslati}, ${s.gpslong})`,
    )
  }

  // 좌표가 실제로 울산 범위(위도 35.4~35.8, 경도 129.0~129.5)에 있는지 확인한다.
  const withCoords = tagoStops.filter(
    (s) => Number.isFinite(Number(s.gpslati)) && Number(s.gpslati) !== 0,
  )
  console.log(
    `  좌표 보유: ${withCoords.length}/${tagoStops.length} (${pct(withCoords.length, tagoStops.length)})`,
  )

  const lats = withCoords.map((s) => Number(s.gpslati))
  const lngs = withCoords.map((s) => Number(s.gpslong))
  if (lats.length > 0) {
    console.log(
      `  좌표 범위: 위도 ${Math.min(...lats).toFixed(4)}~${Math.max(...lats).toFixed(4)}, ` +
        `경도 ${Math.min(...lngs).toFixed(4)}~${Math.max(...lngs).toFixed(4)}`,
    )
    const inUlsan =
      Math.min(...lats) > 35.3 && Math.max(...lats) < 35.9 &&
      Math.min(...lngs) > 128.9 && Math.max(...lngs) < 129.6
    console.log(`  → 울산 범위 ${inUlsan ? '✓ 맞습니다' : '✗ 벗어납니다 (확인 필요)'}`)
  }

  const nodeoCount = tagoStops.filter((s) => s.nodeno !== undefined && s.nodeno !== '').length
  console.log(`  nodeno 보유: ${nodeoCount}/${tagoStops.length} (${pct(nodeoCount, tagoStops.length)})`)

  section('3. BIS ↔ TAGO 정류장 매칭  ★ 최대 리스크')

  const bisStops = await bis.allStops()
  console.log(`  BIS 정류장 ${bisStops.length.toLocaleString()}개 / TAGO 정류소 ${tagoStops.length.toLocaleString()}개`)
  console.log()

  // 매칭 전략 세 가지를 각각 측정한다.
  const byNodeno = new Map<string, TagoStop>()
  const byNodeidDigits = new Map<string, TagoStop>()
  const byName = new Map<string, TagoStop[]>()

  for (const s of tagoStops) {
    const no = digitsOf(s.nodeno)
    if (no) byNodeno.set(no, s)

    const idDigits = digitsOf(s.nodeid)
    if (idDigits) byNodeidDigits.set(idDigits, s)

    const name = String(s.nodenm).trim()
    byName.set(name, [...(byName.get(name) ?? []), s])
  }

  let matchedByNodeno = 0
  let matchedByNodeid = 0
  let matchedByNameUnique = 0
  let matchedByNameAmbiguous = 0
  let unmatched = 0

  const unmatchedSamples: StopRow[] = []

  for (const b of bisStops) {
    const stopId = digitsOf(b.STOPID)
    const name = String(b.STOPNAME).trim()

    if (byNodeno.has(stopId)) {
      matchedByNodeno++
      continue
    }
    if (byNodeidDigits.has(stopId)) {
      matchedByNodeid++
      continue
    }

    const nameHits = byName.get(name)
    if (nameHits?.length === 1) {
      matchedByNameUnique++
    } else if (nameHits && nameHits.length > 1) {
      matchedByNameAmbiguous++
    } else {
      unmatched++
      if (unmatchedSamples.length < 5) unmatchedSamples.push(b)
    }
  }

  const total = bisStops.length
  console.log('  BIS 정류장 기준 매칭 결과:')
  console.log(`    ① STOPID = nodeno            : ${matchedByNodeno} (${pct(matchedByNodeno, total)})`)
  console.log(`    ② STOPID = nodeid의 숫자부   : ${matchedByNodeid} (${pct(matchedByNodeid, total)})`)
  console.log(`    ③ 이름 일치 (유일)           : ${matchedByNameUnique} (${pct(matchedByNameUnique, total)})`)
  console.log(`    ④ 이름 일치 (중복 — 모호)    : ${matchedByNameAmbiguous} (${pct(matchedByNameAmbiguous, total)})`)
  console.log(`    ⑤ 매칭 실패                  : ${unmatched} (${pct(unmatched, total)})`)

  const idMatched = matchedByNodeno + matchedByNodeid
  console.log()
  console.log(`  ID 기반 매칭률(①+②): ${pct(idMatched, total)}`)

  if (idMatched / total > 0.9) {
    console.log('  ✓ ID 조인으로 충분합니다. 계획대로 진행하세요.')
  } else if ((idMatched + matchedByNameUnique) / total > 0.9) {
    console.log('  △ ID 매칭이 부족합니다. 이름 매칭을 함께 써야 합니다.')
    console.log('    이름 중복분은 좌표 없이 두거나 STOPREMARK로 추가 구분하세요.')
  } else {
    console.log('  ✗ 매칭률이 낮습니다. TAGO를 단독 소스로 쓰는 안을 검토하세요.')
    console.log('    (TAGO만으로 정류소 목록·좌표·도착정보가 모두 확보됩니다)')
  }

  if (unmatchedSamples.length > 0) {
    console.log('\n  매칭 실패 샘플:')
    for (const s of unmatchedSamples) {
      console.log(`    STOPID=${s.STOPID}  ${s.STOPNAME}  (${s.STOPREMARK ?? ''})`)
    }
  }

  section('4. 도착정보 교차 비교 (BIS vs TAGO)')

  console.log('  같은 정류장을 두 소스에서 동시에 조회해 값이 일치하는지 봅니다.')
  console.log('  BIS ARRIVALTIME의 단위는 문서에 없고, TAGO arrtime은 [초]로 명시돼 있습니다.')
  console.log('  → 두 값을 나란히 놓으면 BIS 단위를 역으로 확정할 수 있습니다.\n')

  let compared = 0

  for (const b of bisStops) {
    if (compared >= ARRIVAL_COMPARE_SAMPLES) break

    const stopId = digitsOf(b.STOPID)
    const tagoStop = byNodeno.get(stopId) ?? byNodeidDigits.get(stopId)
    if (!tagoStop) continue

    const [bisArrivals, tagoArrivals] = await Promise.all([
      bis.arrivals(String(b.STOPID)).catch(() => []),
      tago.arrivals(cityCode, tagoStop.nodeid).catch(() => []),
    ])

    if (bisArrivals.length === 0 && tagoArrivals.length === 0) continue
    compared++

    console.log(`  ── ${b.STOPNAME} (BIS ${b.STOPID} / TAGO ${tagoStop.nodeid})`)
    console.log(`     BIS  ${bisArrivals.length}건 / TAGO ${tagoArrivals.length}건`)

    // 노선번호를 키로 두 소스를 짝지어 본다.
    for (const ba of bisArrivals) {
      const routeNo = parseRouteName(ba.ROUTENM).number
      const ta = tagoArrivals.find((t) => String(t.routeno) === routeNo)

      if (ta) {
        const bisT = Number(ba.ARRIVALTIME)
        const tagoT = Number(ta.arrtime)
        const ratio = bisT > 0 ? (tagoT / bisT).toFixed(2) : '—'
        console.log(
          `       [${routeNo}] BIS ${ba.ARRIVALTIME}(남은 ${ba.PREVSTOPCNT}) ` +
            `vs TAGO ${ta.arrtime}초(남은 ${ta.arrprevstationcnt})  비율 ${ratio}`,
        )
      } else {
        console.log(`       [${routeNo}] BIS ${ba.ARRIVALTIME}(남은 ${ba.PREVSTOPCNT})  — TAGO에 없음`)
      }
    }

    const bisRouteNos = new Set(bisArrivals.map((a) => parseRouteName(a.ROUTENM).number))
    for (const ta of tagoArrivals) {
      if (!bisRouteNos.has(String(ta.routeno))) {
        console.log(`       [${ta.routeno}] TAGO ${ta.arrtime}초(남은 ${ta.arrprevstationcnt})  — BIS에 없음`)
      }
    }
  }

  if (compared === 0) {
    console.log('  ⚠ 비교할 데이터가 없습니다. 운행 시간대(06~23시)에 다시 실행하세요.')
  } else {
    console.log()
    console.log('  해석:')
    console.log('   - 비율이 1에 가까우면 BIS ARRIVALTIME도 [초]입니다.')
    console.log('   - 비율이 60 근처면 BIS는 [분] 단위입니다.')
    console.log('   - 두 소스의 남은 정류장 수가 다르면 중계 지연이 있다는 뜻입니다.')
  }

  section('요약')
  console.log(`  API 호출: BIS ${getBisCalls()}회 (한도 1,000) / TAGO ${getTagoCalls()}회 (한도 10,000)`)
  console.log()
  console.log('  이 결과로 결정할 것:')
  console.log('   - 주 데이터 소스: TAGO 단독 vs BIS+TAGO 병용')
  console.log('   - 정류장 좌표 매칭 전략')
  console.log('   - BIS ARRIVALTIME 단위')
}

main().catch((error) => {
  console.error('\n✗ 검증 실패:', error instanceof Error ? error.message : error)
  if (error?.cause) console.error('  원인:', error.cause)
  process.exit(1)
})
