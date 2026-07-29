import { NextResponse } from 'next/server'
import { findJourneys } from '@/lib/journey'
import { findNearby, getStop, searchByName } from '@/lib/stops'
import type { Stop } from '@/lib/models'

/**
 * 길찾기.
 *
 *   GET /api/journey?lat=..&lng=..&to=태화강역
 *   GET /api/journey?from=USB194027123&to=USB193012313
 *
 * 출발지는 좌표(현재 위치) 또는 정류장 ID로 준다.
 * 목적지는 정류장 ID 또는 이름으로 준다. 이름이면 동명 정류장을 모두 후보로 삼는다.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  const to = params.get('to')
  if (!to) {
    return NextResponse.json({ error: '목적지(to)가 필요합니다.' }, { status: 400 })
  }

  // ── 목적지 후보
  const destinationStops = resolveStops(to)
  if (destinationStops.length === 0) {
    return NextResponse.json(
      { error: `'${to}'에 해당하는 정류장을 찾지 못했습니다.` },
      { status: 404 },
    )
  }

  // ── 출발지 후보
  const from = params.get('from')
  // Number(null)은 0이라 isFinite를 통과한다. 좌표가 없을 때 (0, 0)으로
  // 근처 정류장을 찾으면 엉뚱한 결과가 나오므로 null로 걸러낸다.
  const lat = toCoord(params.get('lat'))
  const lng = toCoord(params.get('lng'))

  let originStops: (Stop & { distance?: number })[]

  if (from) {
    originStops = resolveStops(from)
  } else if (lat !== null && lng !== null) {
    // 걸어갈 만한 범위의 정류장을 모두 후보로 둔다.
    // 조금 더 걸어서 직통 버스를 타는 게 나은 경우가 많다.
    originStops = findNearby(lat, lng, { limit: 4, maxDistance: 700 })
  } else {
    return NextResponse.json(
      { error: '출발지(from 또는 lat/lng)가 필요합니다.' },
      { status: 400 },
    )
  }

  if (originStops.length === 0) {
    return NextResponse.json(
      { error: '출발지 근처에 정류장이 없습니다.' },
      { status: 404 },
    )
  }

  try {
    const result = await findJourneys(originStops, destinationStops)
    return NextResponse.json({
      ...result,
      origin: originStops[0],
      destination: destinationStops[0],
    })
  } catch (error) {
    console.error('[journey]', error)
    return NextResponse.json(
      { error: '길찾기에 실패했습니다.' },
      { status: 500 },
    )
  }
}

/** 빈 값·비숫자를 null로 만든다. Number(null) === 0 함정을 피하기 위함. */
function toCoord(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** nodeid면 그 정류장 하나, 이름이면 동명 정류장을 모두 후보로 반환한다. */
function resolveStops(value: string): Stop[] {
  const byId = getStop(value)
  if (byId) return [byId]

  return searchByName(value, { limit: 3 })
}
