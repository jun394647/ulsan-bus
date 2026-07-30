import { NextResponse } from 'next/server'
import { getArrivals } from '@/lib/arrivals'
import { getStopRoutes } from '@/lib/routes'
import { getStop } from '@/lib/stops'
import { TagoError } from '@/lib/tago/client'

/**
 * 정류소 도착정보.
 *
 *   GET /api/arrivals/USB193031021
 *
 * 방면(종점)과 노선 유형을 경유노선 정보로 보강해서 준다.
 * 이 응답을 쓰는 곳이 정류장 상세와 홈의 즐겨찾기 카드인데, 방면 없이 노선번호만
 * 보여주면 반대편으로 가는 버스를 탈 수 있다. 울산 정류소의 47%가 동명이다.
 * 경유노선은 DB에 캐시되어 있어(대개 77ms) 보강 비용이 크지 않다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ nodeid: string }> },
) {
  const { nodeid } = await params

  const stop = getStop(nodeid)
  if (!stop) {
    return NextResponse.json(
      { error: '알 수 없는 정류소입니다.' },
      { status: 404 },
    )
  }

  // 경유노선이 실패해도 도착정보는 내보낸다. 방면은 있으면 좋은 정보다.
  const [arrivalResult, routeResult] = await Promise.allSettled([
    getArrivals(nodeid),
    getStopRoutes(nodeid),
  ])

  if (arrivalResult.status === 'rejected') {
    const reason = arrivalResult.reason
    // 외부 API 장애와 우리 쪽 버그를 구분해서 알려준다.
    const message =
      reason instanceof TagoError
        ? `도착정보를 가져오지 못했습니다: ${reason.message}`
        : '도착정보를 가져오지 못했습니다.'

    console.error('[arrivals]', nodeid, reason)
    return NextResponse.json({ stop, error: message }, { status: 502 })
  }

  if (routeResult.status === 'rejected') {
    console.error('[arrivals] 경유노선', nodeid, routeResult.reason)
  }
  const routes = routeResult.status === 'fulfilled' ? routeResult.value : []
  const routeById = new Map(routes.map((route) => [route.routeId, route]))

  const arrivals = arrivalResult.value.arrivals.map((arrival) => {
    const route = routeById.get(arrival.routeId)
    return {
      ...arrival,
      destination: route?.end,
      routeType: arrival.routeType ?? route?.routeType,
    }
  })

  return NextResponse.json({
    stop,
    arrivals,
    // 응답을 만든 시각이 아니라 값을 실제로 받은 시각을 준다.
    fetchedAt: arrivalResult.value.observedAt.toISOString(),
  })
}
