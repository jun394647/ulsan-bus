import { NextResponse } from 'next/server'
import { getArrivals } from '@/lib/arrivals'
import { getStop } from '@/lib/stops'
import { TagoError } from '@/lib/tago/client'

/**
 * 정류소 도착정보.
 *
 *   GET /api/arrivals/USB193031021
 *
 * TAGO 응답이 느려서(실측 4~13초) 응답 시간이 길 수 있다.
 * 클라이언트는 이전 값을 유지한 채 갱신하도록 만든다.
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

  try {
    const result = await getArrivals(nodeid)
    return NextResponse.json({
      stop,
      arrivals: result.arrivals,
      // 응답을 만든 시각이 아니라 값을 실제로 관측한 시각을 준다.
      // 캐시된 값이면 최대 100초 전일 수 있고, 그걸 화면에 그대로 보여줘야 한다.
      fetchedAt: result.observedAt.toISOString(),
    })
  } catch (error) {
    // 외부 API 장애와 우리 쪽 버그를 구분해서 알려준다.
    const message =
      error instanceof TagoError
        ? `도착정보를 가져오지 못했습니다: ${error.message}`
        : '도착정보를 가져오지 못했습니다.'

    console.error('[arrivals]', nodeid, error)
    return NextResponse.json({ stop, error: message }, { status: 502 })
  }
}
