'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Arrival, ArrivalsResponse, Stop, StopRoute } from '@/lib/models'
import { RouteBadge, RouteTypeLabel } from './RouteBadge'
import { DEFAULT_LEAD_SECONDS, useArrivalAlerts } from '@/lib/notify'
import { ShareButton } from './ShareButton'

/** 자동 갱신 간격. 트래픽 한도(10,000회/일)와 체감 신선도의 절충값. */
const REFRESH_MS = 30_000

/** 이 시간 안에 오는 버스는 강조한다. 지금 뛰어야 할지 판단하는 기준. */
const URGENT_SECONDS = 180

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  if (seconds < 60) return '곧 도착'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}분`

  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`
}

/**
 * 타임존을 한국으로 고정한다.
 *
 * getHours()를 쓰면 서버(Vercel은 UTC)와 브라우저(KST)가 9시간 다른 값을 렌더해서
 * hydration이 깨진다(React #418). 울산 버스 서비스이므로 항상 KST가 맞다.
 */
const formatClock = (date: Date) =>
  date.toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    minute: '2-digit',
  })

/**
 * 도착정보 표시와 자동 갱신.
 *
 * 첫 데이터는 서버에서 받아 props로 들어온다. 이 컴포넌트는 갱신만 책임진다.
 */
export function ArrivalBoard({
  stop,
  initialArrivals,
  initialObservedAt,
  initialError,
  routes,
}: {
  stop: Stop
  initialArrivals: Arrival[]
  initialObservedAt?: string
  initialError?: string
  routes: StopRoute[]
}) {
  const [arrivals, setArrivals] = useState(initialArrivals)
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(
    initialObservedAt ? new Date(initialObservedAt) : null,
  )
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 응답이 겹칠 수 있다. 진행 중이면 건너뛴다.
  const inFlight = useRef(false)

  const alerts = useArrivalAlerts(stop.name)

  // 값이 바뀔 때마다 알림 조건을 확인한다.
  // 렌더 중에 부르면 안 되므로 갱신 직후(load)와 초기값에 대해 각각 처리한다.
  const checkAlerts = alerts.check

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setIsRefreshing(true)

    try {
      const response = await fetch(`/api/arrivals/${stop.nodeid}`)
      const data = (await response.json()) as ArrivalsResponse

      if (!response.ok || data.error) {
        setError(data.error ?? '도착정보를 가져오지 못했습니다.')
      } else {
        // 이전 값을 지우지 않고 갈아끼운다. 갱신 중 화면이 비지 않게.
        const next = data.arrivals ?? []
        setArrivals(next)
        setFetchedAt(data.fetchedAt ? new Date(data.fetchedAt) : new Date())
        setError(null)
        checkAlerts(next)
      }
    } catch {
      setError('네트워크 오류로 도착정보를 가져오지 못했습니다.')
    } finally {
      inFlight.current = false
      setIsRefreshing(false)
    }
  }, [stop.nodeid, checkAlerts])

  useEffect(() => {
    // 초기 데이터는 서버가 이미 줬으므로 여기서 부르지 않는다.
    const timer = setInterval(load, REFRESH_MS)

    // 화면을 다시 보면 즉시 갱신한다. 주머니에서 꺼냈을 때 옛 정보를 보면 안 된다.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  // 지금 오고 있지 않은 노선. 막차 후에도 무슨 버스가 다니는지 보여준다.
  const arrivingIds = new Set(arrivals.map((a) => a.routeId))
  const idleRoutes = routes.filter((r) => !arrivingIds.has(r.routeId))

  return (
    <div className="flex flex-1 flex-col pb-10">
      <div className="flex items-center justify-between px-4 py-2.5 text-sm text-[var(--color-muted)]">
        <span className="tabular">
          {fetchedAt ? `${formatClock(fetchedAt)} 기준` : '불러오는 중…'}
        </span>
        <div className="flex items-center gap-1">
          <ShareButton stop={stop} />
          <button
            onClick={() => load()}
            disabled={isRefreshing}
            className="rounded-lg px-2.5 py-1 font-medium text-[var(--color-accent)] active:bg-[var(--color-surface)] disabled:opacity-40"
          >
            {isRefreshing ? '갱신 중…' : '새로고침'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mx-4 rounded-xl bg-[var(--color-urgent-surface)] px-4 py-3 text-sm text-[var(--color-urgent)]">
          {error}
        </p>
      )}

      {!error && arrivals.length === 0 && (
        <p className="px-4 py-10 text-center leading-relaxed text-[var(--color-muted)]">
          도착 예정인 버스가 없습니다.
          <br />
          운행이 끝났거나 아직 출발 전일 수 있습니다.
        </p>
      )}

      {arrivals.length > 0 && (
        <ul className="flex flex-col gap-2 px-4">
          {arrivals.map((arrival) => (
            <ArrivalCard
              key={arrival.routeId}
              arrival={arrival}
              watched={alerts.watched.has(arrival.routeId)}
              onToggleAlert={() => alerts.toggle(arrival.routeId)}
            />
          ))}
        </ul>
      )}

      {alerts.watched.size > 0 && (
        <p className="mx-4 mt-3 rounded-xl bg-[var(--color-surface)] px-4 py-3 text-xs leading-relaxed text-[var(--color-muted)]">
          도착 {Math.round(DEFAULT_LEAD_SECONDS / 60)}분 전에 알려드립니다.
          <br />
          <b>이 화면을 닫으면 알림이 해제됩니다.</b> 다른 앱을 보고 있어도 괜찮지만
          탭은 열어두세요.
        </p>
      )}

      {alerts.permission === 'denied' && (
        <p className="mx-4 mt-3 rounded-xl bg-[var(--color-surface)] px-4 py-3 text-xs text-[var(--color-muted)]">
          알림 권한이 거부되어 있습니다. 브라우저 설정에서 허용해 주세요.
        </p>
      )}

      {idleRoutes.length > 0 && (
        <>
          <h2 className="px-4 pt-7 pb-2 text-sm font-semibold text-[var(--color-muted)]">
            이 정류장을 지나는 다른 노선
          </h2>
          <ul className="flex flex-col gap-px overflow-hidden rounded-xl border border-[var(--color-border)] mx-4">
            {idleRoutes.map((route) => (
              <li
                key={route.routeId}
                className="flex items-center gap-2.5 bg-[var(--color-surface)] px-3.5 py-3"
              >
                <RouteBadge routeNo={route.routeNo} routeType={route.routeType} />
                <RouteTypeLabel routeType={route.routeType} />
                {route.end && (
                  <span className="ml-auto truncate text-sm text-[var(--color-muted)]">
                    {route.end} 방면
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ArrivalCard({
  arrival,
  watched,
  onToggleAlert,
}: {
  arrival: Arrival
  watched: boolean
  onToggleAlert: () => void
}) {
  const isUrgent = arrival.correctedSeconds < URGENT_SECONDS
  // 이미 임박한 버스에 알림을 걸 이유가 없다.
  const canAlert = arrival.correctedSeconds > DEFAULT_LEAD_SECONDS

  return (
    <li
      className="flex items-center gap-3 rounded-xl border px-4 py-3.5"
      style={{
        borderColor: isUrgent ? 'var(--urgent)' : 'var(--border)',
        backgroundColor: isUrgent ? 'var(--urgent-surface)' : 'var(--surface)',
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <RouteBadge
            routeNo={arrival.routeNo}
            routeType={arrival.routeType}
            size="lg"
          />
          <RouteTypeLabel routeType={arrival.routeType} />
          {arrival.isLowFloor && (
            <span className="rounded bg-[var(--color-surface-strong)] px-1.5 py-0.5 text-xs text-[var(--color-muted)]">
              저상
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
          <span className="tabular">
            {arrival.remainingStops <= 0
              ? '접근 중'
              : `${arrival.remainingStops}개 정류장 전`}
          </span>
          {arrival.destination && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{arrival.destination} 방면</span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div
          className="tabular text-right text-2xl font-bold"
          style={{ color: isUrgent ? 'var(--urgent)' : 'var(--foreground)' }}
        >
          {formatEta(arrival.correctedSeconds)}
        </div>

        {(canAlert || watched) && (
          <button
            onClick={onToggleAlert}
            aria-pressed={watched}
            aria-label={watched ? '도착 알림 해제' : '도착 알림 설정'}
            className="rounded-full p-1.5 text-lg leading-none active:bg-[var(--color-surface-strong)]"
            style={{ color: watched ? 'var(--accent)' : 'var(--muted)' }}
          >
            {watched ? '🔔' : '🔕'}
          </button>
        )}
      </div>
    </li>
  )
}
