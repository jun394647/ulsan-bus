import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getStop } from '@/lib/stops'
import { getArrivals } from '@/lib/arrivals'
import { getStopRoutes } from '@/lib/routes'
import { ArrivalBoard } from '@/components/ArrivalBoard'
import { FavoriteButton } from '@/components/FavoriteButton'
import { RecordVisit } from '@/components/RecordVisit'
import type { Arrival, Stop, StopRoute } from '@/lib/models'

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
      <header className="px-4 pt-4 pb-4">
        <Link
          href="/"
          className="inline-block py-1 text-sm text-[var(--color-muted)]"
        >
          ← 정류장 목록
        </Link>

        <div className="mt-1.5 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{stop.name}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <span className="tabular">{stop.nodeno}</span>
              <span aria-hidden>·</span>
              <a
                href={`https://map.kakao.com/link/map/${encodeURIComponent(stop.name)},${stop.lat},${stop.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-accent)]"
              >
                지도에서 보기
              </a>
            </div>
          </div>
          <FavoriteButton stop={stop} />
        </div>
      </header>

      {/* 최근 본 정류장 기록. 화면에는 아무것도 그리지 않는다. */}
      <RecordVisit stop={stop} />

      {/*
        TAGO 응답이 간헐적으로 느리다. 헤더(정류장 이름)를 먼저 내보내고
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
  let routes: StopRoute[] = []
  let observedAt: string | undefined
  let fromCache = false
  let error: string | undefined

  // 경유노선이 실패해도 도착정보는 보여줘야 하므로 각각 독립적으로 처리한다.
  const [arrivalResult, routeResult] = await Promise.allSettled([
    getArrivals(stop.nodeid),
    getStopRoutes(stop.nodeid),
  ])

  if (arrivalResult.status === 'fulfilled') {
    arrivals = arrivalResult.value.arrivals
    observedAt = arrivalResult.value.observedAt.toISOString()
    fromCache = arrivalResult.value.fromCache
  } else {
    console.error('[stop page] 도착정보', stop.nodeid, arrivalResult.reason)
    error = '도착정보를 가져오지 못했습니다. 잠시 후 새로고침해 주세요.'
  }

  if (routeResult.status === 'fulfilled') {
    routes = routeResult.value
  } else {
    console.error('[stop page] 경유노선', stop.nodeid, routeResult.reason)
  }

  // 도착 예정 버스를 경유노선 정보로 보강한다.
  //  - 방면(종점): 같은 번호가 양방향으로 지날 때 어느 쪽인지 알려준다.
  //  - 노선 유형: 도착정보에는 없거나, 캐시에서 온 값에는 빠져 있다.
  //    좌석버스는 요금이 다르므로 타기 전에 알아야 한다.
  const routeById = new Map(routes.map((r) => [r.routeId, r]))

  const enriched = arrivals.map((arrival) => {
    const route = routeById.get(arrival.routeId)
    return {
      ...arrival,
      destination: route?.end,
      routeType: arrival.routeType ?? route?.routeType,
    }
  })

  return (
    <ArrivalBoard
      stop={stop}
      initialArrivals={enriched}
      initialObservedAt={observedAt}
      initialFromCache={fromCache}
      initialError={error}
      routes={routes}
    />
  )
}

function ArrivalsFallback() {
  return (
    <div className="flex flex-col gap-2 px-4 pt-9">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-[76px] w-full" />
      ))}
    </div>
  )
}
