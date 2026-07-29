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

  const lat = Number(params.get('lat'))
  const lng = Number(params.get('lng'))
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)

  const query = params.get('q')
  if (query) {
    // 좌표를 함께 받으면 동명 정류소를 가까운 순으로 정렬해 준다.
    return NextResponse.json({
      stops: searchByName(query, hasCoords ? { near: { lat, lng } } : {}),
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
