/**
 * TAGO에서 울산 전체 정류소를 받아 정적 스냅샷(data/stops.json)을 만든다.
 *
 * 근접 정류소는 TAGO의 getCrdntPrxmtSttnList로도 구할 수 있지만 스냅샷을 쓰는 이유:
 *  - 매 요청이 트래픽을 소모하지 않는다 (하루 10,000회 한도를 도착정보에 몰아줄 수 있다)
 *  - 응답이 느리다 (실측 4~13초). 로컬 계산은 즉시다.
 *  - 근접조회가 타 도시 정류장(YSB… 등)을 섞어 반환한다. 스냅샷은 울산만 담는다.
 *
 * 실행: pnpm build:stops
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tago, getCallCount } from '../src/lib/tago/client'
import type { TagoStop } from '../src/lib/tago/types'

const ULSAN_CITY_CODE = 26
const PAGE_SIZE = 1000
const MAX_PAGES = 20

/** 울산 대략 경계. 좌표 이상치를 걸러낸다. */
const BOUNDS = { minLat: 35.3, maxLat: 35.9, minLng: 128.9, maxLng: 129.6 }

export interface StopSnapshot {
  /** TAGO 정류소 ID. 도착정보 조회 키. */
  nodeid: string
  /** 시민이 보는 정류소 번호 */
  nodeno: number
  name: string
  lat: number
  lng: number
}

async function main() {
  console.log('울산 정류소를 수집합니다 (TAGO getSttnNoList)...')

  const collected: TagoStop[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const started = Date.now()
    const rows = await tago.stops(ULSAN_CITY_CODE, page, PAGE_SIZE)
    console.log(`  page ${page}: ${rows.length}건 (${Date.now() - started}ms)`)

    collected.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  console.log(`\n원본 ${collected.length.toLocaleString()}건 수집`)

  // 중복 제거 — 페이지 경계에서 같은 정류소가 다시 나오는 경우가 있다.
  const seen = new Set<string>()
  const stops: StopSnapshot[] = []

  let droppedNoCoord = 0
  let droppedOutOfBounds = 0
  let droppedDuplicate = 0

  for (const s of collected) {
    if (seen.has(s.nodeid)) {
      droppedDuplicate++
      continue
    }
    seen.add(s.nodeid)

    const lat = Number(s.gpslati)
    const lng = Number(s.gpslong)

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
      droppedNoCoord++
      continue
    }

    if (
      lat < BOUNDS.minLat || lat > BOUNDS.maxLat ||
      lng < BOUNDS.minLng || lng > BOUNDS.maxLng
    ) {
      droppedOutOfBounds++
      continue
    }

    stops.push({
      nodeid: s.nodeid,
      nodeno: Number(s.nodeno),
      name: String(s.nodenm).trim(),
      lat,
      lng,
    })
  }

  console.log(`  중복 제거: ${droppedDuplicate}건`)
  console.log(`  좌표 없음: ${droppedNoCoord}건`)
  console.log(`  울산 경계 밖: ${droppedOutOfBounds}건`)
  console.log(`\n최종 ${stops.length.toLocaleString()}개 정류소`)

  // nodeid 접두어 분포 — 울산 외 정류소가 섞이지 않았는지 확인한다.
  const prefixes = new Map<string, number>()
  for (const s of stops) {
    const prefix = s.nodeid.slice(0, 3)
    prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1)
  }
  console.log(
    `  nodeid 접두어: ${[...prefixes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([p, n]) => `${p} ${n}개`)
      .join(', ')}`,
  )

  const names = new Set(stops.map((s) => s.name))
  console.log(`  고유 이름 ${names.size}개 (동명 정류소가 ${stops.length - names.size}개 존재)`)

  const outDir = join(process.cwd(), 'data')
  await mkdir(outDir, { recursive: true })

  const outPath = join(outDir, 'stops.json')
  await writeFile(outPath, JSON.stringify(stops), 'utf-8')

  console.log(`\n✓ ${outPath}`)
  console.log(`  API 호출 ${getCallCount()}회`)
}

main().catch((error) => {
  console.error('\n✗ 실패:', error instanceof Error ? error.message : error)
  if (error?.cause) console.error('  원인:', error.cause)
  process.exit(1)
})
