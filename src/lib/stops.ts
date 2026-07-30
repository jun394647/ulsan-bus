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

const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
]

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
/** 한 초성이 담당하는 음절 수 (중성 21 × 종성 28) */
const SYLLABLES_PER_CHOSEONG = 588

/** "화정주공" → "ㅎㅈㅈㄱ". 한글이 아닌 문자는 그대로 남긴다. */
function toChoseong(text: string): string {
  let result = ''
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code >= HANGUL_START && code <= HANGUL_END) {
      result += CHOSEONG[Math.floor((code - HANGUL_START) / SYLLABLES_PER_CHOSEONG)]
    } else {
      result += char
    }
  }
  return result
}

/**
 * 괄호 안 부가 설명을 뗀 이름. "태화강역(1번 정류소)" → "태화강역"
 *
 * 검색 순위를 매길 때 쓴다. 그냥 이름 길이로 정렬하면 괄호 설명이 붙은
 * "태화강역(1번 정류소)"이 "태화강국가정원 로터리"보다 길어서 뒤로 밀린다.
 */
const coreName = (name: string) => name.replace(/\([^)]*\)/g, '').trim()

/**
 * 검색어와의 관련성 순으로 정렬한다.
 *
 * "태화강"을 쳤을 때 "태화강역"이 "태화강국가정원 동강병원"보다 먼저 나와야 한다.
 * 핵심 이름이 짧다는 것은 검색어가 그 정류장을 거의 그대로 가리킨다는 뜻이다.
 */
const byRelevance = (a: Stop, b: Stop) =>
  coreName(a.name).length - coreName(b.name).length

/**
 * 입력이 초성만으로 되어 있는지.
 *
 * 한글 입력 중에는 "ㅎ", "화저" 같은 중간 상태가 계속 들어온다.
 * 완성된 음절이 하나라도 섞이면 일반 검색으로 넘겨야 한다 —
 * 그러지 않으면 타이핑하는 동안 결과가 엉뚱하게 튄다.
 */
function isChoseongOnly(text: string): boolean {
  return text.length > 0 && [...text].every((c) => CHOSEONG.includes(c))
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

  // 초성만 입력했으면 초성으로 찾는다. "ㅎㅈㅈㄱ" → "화정주공아파트앞"
  if (isChoseongOnly(q)) {
    // 일치 강도로 나눈다. "ㅅㅊ"이면 초성이 딱 "ㅅㅊ"인 "시청"이
    // "새창골"(ㅅㅊㄱ)보다 먼저 나와야 한다.
    const exact: Stop[] = []
    const prefix: Stop[] = []
    const inner: Stop[] = []

    for (const stop of stops) {
      const cho = toChoseong(stop.name)
      if (cho === q) exact.push(stop)
      else if (cho.startsWith(q)) prefix.push(stop)
      else if (cho.includes(q)) inner.push(stop)
    }

    // 그룹 안에서는 관련성(핵심 이름이 짧은 순)으로, 위치를 알면 거리순으로.
    exact.sort(byRelevance)
    prefix.sort(byRelevance)
    inner.sort(byRelevance)

    return [
      ...withDistance(exact),
      ...withDistance(prefix),
      ...withDistance(inner),
    ].slice(0, limit)
  }

  const lowered = q.toLowerCase()
  const exact: Stop[] = []
  const startsWith: Stop[] = []
  const contains: Stop[] = []

  for (const stop of stops) {
    const name = stop.name.toLowerCase()
    // 괄호 설명을 뗀 이름이 검색어와 같으면 가장 정확한 결과다.
    // "태화강역"을 쳤을 때 "태화강역(1번 정류소)"이 여기 걸린다.
    if (coreName(name) === lowered) exact.push(stop)
    else if (name.startsWith(lowered)) startsWith.push(stop)
    else if (name.includes(lowered)) contains.push(stop)
  }

  exact.sort(byRelevance)
  startsWith.sort(byRelevance)
  contains.sort(byRelevance)

  // 일치 강도를 거리보다 우선한다.
  return [
    ...withDistance(exact),
    ...withDistance(startsWith),
    ...withDistance(contains),
  ].slice(0, limit)
}
