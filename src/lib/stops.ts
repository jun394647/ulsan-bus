import stopsData from '../../data/stops.json'
import { distanceMeters } from './geo'

/**
 * 정류소 스냅샷 조회. scripts/build-stops.ts가 만든 data/stops.json을 쓴다.
 *
 * 3,615개를 메모리에 올려 선형 탐색한다. 이 규모에서 공간 인덱스는 과하다 —
 * 전체 순회가 1ms 안쪽이고, 인덱스를 두면 스냅샷 갱신마다 재구축해야 한다.
 *
 * ⚠ 서버에서만 import할 것. 스냅샷이 366KB라 클라이언트 번들에 들어가면 안 된다.
 *   ('server-only'를 쓰지 않은 이유: 검증 스크립트에서도 이 모듈을 직접 돌린다)
 */

import type { NearbyStop, Stop } from './models'

export type { NearbyStop, Stop }

const stops = stopsData as Stop[]

export const allStops = (): readonly Stop[] => stops

const byNodeId = new Map(stops.map((s) => [s.nodeid, s]))

export const getStop = (nodeid: string): Stop | undefined => byNodeId.get(nodeid)

/**
 * 좌표에서 가까운 정류소.
 *
 * TAGO에도 근접조회 오퍼레이션이 있지만 쓰지 않는다. 매 요청이 트래픽을 먹고,
 * 응답이 느리고(실측 4~13초), 타 도시 정류소가 섞여 나온다.
 */
export function findNearby(
  lat: number,
  lng: number,
  { limit = 10, maxDistance = 1000 }: { limit?: number; maxDistance?: number } = {},
): NearbyStop[] {
  const result: NearbyStop[] = []

  for (const stop of stops) {
    const distance = distanceMeters(lat, lng, stop.lat, stop.lng)
    if (distance <= maxDistance) {
      result.push({ ...stop, distance })
    }
  }

  return result.sort((a, b) => a.distance - b.distance).slice(0, limit)
}

/**
 * 이름 또는 번호로 정류소 검색.
 *
 * 동명 정류소가 전체의 47%(1,701개)다. "공업탑"만 해도 40401~40404 네 곳이라
 * 이름만으로는 어느 쪽인지 알 수 없다. 사용자 위치를 알면 같은 이름 안에서
 * 가까운 순으로 정렬해 이 모호함을 줄인다.
 */
export function searchByName(
  query: string,
  { limit = 20, near }: { limit?: number; near?: { lat: number; lng: number } } = {},
): (Stop | NearbyStop)[] {
  const q = query.trim()
  if (!q) return []

  const withDistance = (list: Stop[]): (Stop | NearbyStop)[] => {
    if (!near) return list
    return list
      .map((s) => ({ ...s, distance: distanceMeters(near.lat, near.lng, s.lat, s.lng) }))
      .sort((a, b) => a.distance - b.distance)
  }

  // 숫자만 입력하면 정류소 번호로 본다. 번호는 유일하므로 거리 정렬이 의미 없다.
  if (/^\d+$/.test(q)) {
    const exact = stops.filter((s) => String(s.nodeno) === q)
    const partial = stops.filter(
      (s) => String(s.nodeno) !== q && String(s.nodeno).includes(q),
    )
    return [...exact, ...partial].slice(0, limit)
  }

  const lowered = q.toLowerCase()
  const startsWith: Stop[] = []
  const contains: Stop[] = []

  for (const stop of stops) {
    const name = stop.name.toLowerCase()
    if (name.startsWith(lowered)) startsWith.push(stop)
    else if (name.includes(lowered)) contains.push(stop)
  }

  // 이름 일치도를 거리보다 우선한다. 정확히 시작하는 이름이 먼저다.
  return [...withDistance(startsWith), ...withDistance(contains)].slice(0, limit)
}
