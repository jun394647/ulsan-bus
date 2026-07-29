import { NextResponse } from 'next/server'
import { findNearby, searchByName } from '@/lib/stops'

/**
 * 근처 정류소 조회. 정적 스냅샷 기반이라 외부 API를 호출하지 않는다.
 * 일일 트래픽 한도를 도착정보 조회에 몰아주기 위한 선택이다.
 *
 *   GET /api/stops/nearby?lat=35.5384&lng=129.3114
 *   GET /api/stops/nearby?q=시청
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  // Number(null)은 0이고 isFinite(0)은 true다. 파라미터가 없을 때 그대로 쓰면
  // 위경도 (0, 0) — 아프리카 서쪽 바다 — 기준으로 거리를 계산해 버린다.
  const lat = toCoord(params.get('lat'))
  const lng = toCoord(params.get('lng'))
  const hasCoords = lat !== null && lng !== null

  const query = params.get('q')
  if (query) {
    // 좌표를 함께 받으면 동명 정류소를 가까운 순으로 정렬해 준다.
    return NextResponse.json({
      stops: searchByName(
        query,
        hasCoords ? { near: { lat, lng } } : {},
      ),
    })
  }

  if (!hasCoords) {
    return NextResponse.json(
      { error: 'lat/lng 또는 q 파라미터가 필요합니다.' },
      { status: 400 },
    )
  }

  const limit = Number(params.get('limit')) || 10
  const maxDistance = Number(params.get('maxDistance')) || 1000

  return NextResponse.json({
    stops: findNearby(lat, lng, { limit, maxDistance }),
  })
}

/** 빈 값·비숫자를 null로 만든다. Number(null) === 0 함정을 피하기 위함. */
function toCoord(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
