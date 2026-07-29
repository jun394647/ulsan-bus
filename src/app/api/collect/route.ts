import { NextResponse } from 'next/server'
import { collect } from '@/lib/collector'

/**
 * 수집 트리거. 스케줄러(크론)가 주기적으로 호출한다.
 *
 * 공개 엔드포인트로 두면 아무나 호출해 트래픽 한도를 태울 수 있으므로
 * CRON_SECRET으로 막는다. Vercel Cron은 이 값을 Authorization 헤더에 자동으로 넣고,
 * 다른 스케줄러를 쓸 때는 직접 헤더를 붙여야 한다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET이 설정되지 않았습니다.' },
      { status: 500 },
    )
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  try {
    const result = await collect()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[collect]', error)
    return NextResponse.json(
      {
        error: '수집에 실패했습니다.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
