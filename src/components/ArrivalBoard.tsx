'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Arrival, ArrivalsResponse, Stop } from '@/lib/models'

/** 자동 갱신 간격. 트래픽 한도(10,000회/일)와 체감 신선도의 절충값. */
const REFRESH_MS = 30_000

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return '곧 도착'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}분`

  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`
}

const formatClock = (date: Date) =>
  `${date.getHours()}시 ${String(date.getMinutes()).padStart(2, '0')}분 기준`

/**
 * 도착정보 표시와 자동 갱신.
 *
 * 첫 데이터는 서버에서 받아 props로 들어온다. TAGO 응답이 4~13초로 느려서
 * 클라이언트에서 처음부터 부르면 빈 화면이 그만큼 길어진다.
 * 이 컴포넌트는 갱신만 책임진다.
 */
export function ArrivalBoard({
  stop,
  initialArrivals,
  initialObservedAt,
  initialError,
}: {
  stop: Stop
  initialArrivals: Arrival[]
  initialObservedAt?: string
  initialError?: string
}) {
  const [arrivals, setArrivals] = useState(initialArrivals)
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(
    initialObservedAt ? new Date(initialObservedAt) : null,
  )
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 응답이 느려 갱신이 겹칠 수 있다. 진행 중이면 건너뛴다.
  const inFlight = useRef(false)

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
        setArrivals(data.arrivals ?? [])
        setFetchedAt(data.fetchedAt ? new Date(data.fetchedAt) : new Date())
        setError(null)
      }
    } catch {
      setError('네트워크 오류로 도착정보를 가져오지 못했습니다.')
    } finally {
      inFlight.current = false
      setIsRefreshing(false)
    }
  }, [stop.nodeid])

  useEffect(() => {
    // 초기 데이터는 서버가 이미 줬으므로 여기서 부르지 않는다.
    // setState는 전부 콜백 안에서만 일어난다.
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

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between px-4 py-2 text-sm text-[var(--color-muted)]">
        <span>{fetchedAt ? formatClock(fetchedAt) : '방금 기준'}</span>
        <button
          onClick={load}
          disabled={isRefreshing}
          className="rounded-md px-2 py-1 active:bg-[var(--color-surface)] disabled:opacity-50"
        >
          {isRefreshing ? '갱신 중…' : '새로고침'}
        </button>
      </div>

      {error && (
        <p className="mx-4 rounded-lg bg-[var(--color-surface)] px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {!error && arrivals.length === 0 && (
        <p className="px-4 py-10 text-center text-[var(--color-muted)]">
          도착 예정인 버스가 없습니다.
          <br />
          운행이 끝났거나 아직 출발 전일 수 있습니다.
        </p>
      )}

      {arrivals.length > 0 && (
        <ul className="divide-y divide-[var(--color-border)]">
          {arrivals.map((arrival) => (
            <ArrivalRow
              key={`${arrival.routeId}-${arrival.remainingStops}`}
              arrival={arrival}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function ArrivalRow({ arrival }: { arrival: Arrival }) {
  const isUrgent = arrival.correctedSeconds < 180

  return (
    <li className="flex items-center gap-3 px-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="tabular text-xl font-bold">{arrival.routeNo}</span>
          {arrival.isLowFloor && (
            <span className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-xs text-[var(--color-muted)]">
              저상
            </span>
          )}
        </div>
        <div className="tabular mt-1 text-sm text-[var(--color-muted)]">
          {/* 0이면 이미 직전 구간에 들어와 있다. "0개 정류장 전"은 뜻이 통하지 않는다. */}
          {arrival.remainingStops <= 0
            ? '접근 중'
            : `${arrival.remainingStops}개 정류장 전`}
        </div>
      </div>

      <div
        className={`tabular shrink-0 text-right text-xl font-semibold ${
          isUrgent ? 'text-[var(--color-urgent)]' : ''
        }`}
      >
        {formatEta(arrival.correctedSeconds)}
      </div>
    </li>
  )
}
