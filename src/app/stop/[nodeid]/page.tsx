import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getStop } from '@/lib/stops'
import { getArrivals } from '@/lib/arrivals'
import { ArrivalBoard } from '@/components/ArrivalBoard'
import { FavoriteButton } from '@/components/FavoriteButton'
import type { Arrival, Stop } from '@/lib/models'

export default async function StopPage({
  params,
}: {
  params: Promise<{ nodeid: string }>
}) {
  const { nodeid } = await params
  const stop = getStop(nodeid)

  if (!stop) notFound()

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <header className="border-b border-[var(--color-border)] px-4 pt-4 pb-3">
        <Link href="/" className="text-sm text-[var(--color-muted)]">
          ← 정류장 목록
        </Link>
        <div className="mt-2 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{stop.name}</h1>
            <p className="tabular mt-0.5 text-sm text-[var(--color-muted)]">
              {stop.nodeno}
            </p>
          </div>
          <FavoriteButton stop={stop} />
        </div>
      </header>

      {/*
        TAGO 응답이 4~13초로 느리다. 헤더(정류장 이름)를 먼저 내보내고
        도착정보만 스트리밍해서, 잘못 눌렀을 때 바로 알 수 있게 한다.
      */}
      <Suspense fallback={<ArrivalsFallback />}>
        <ArrivalsSection stop={stop} />
      </Suspense>
    </main>
  )
}

async function ArrivalsSection({ stop }: { stop: Stop }) {
  // try는 데이터 조회만 감싼다. JSX를 try 안에서 만들면 렌더 단계의 오류가
  // 여기서 잡히는 것처럼 보이지만 실제로는 잡히지 않는다.
  let arrivals: Arrival[] = []
  let observedAt: string | undefined
  let error: string | undefined

  try {
    const result = await getArrivals(stop.nodeid)
    arrivals = result.arrivals
    observedAt = result.observedAt.toISOString()
  } catch (caught) {
    console.error('[stop page]', stop.nodeid, caught)
    error = '도착정보를 가져오지 못했습니다. 잠시 후 새로고침해 주세요.'
  }

  return (
    <ArrivalBoard
      stop={stop}
      initialArrivals={arrivals}
      initialObservedAt={observedAt}
      initialError={error}
    />
  )
}

function ArrivalsFallback() {
  return (
    <p className="px-4 py-10 text-center text-[var(--color-muted)]">
      도착정보를 불러오는 중…
    </p>
  )
}
