'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Arrival, ArrivalsResponse, Stop } from '@/lib/models'
import { RouteBadge } from './RouteBadge'
import { shortenPlace } from '@/lib/place'

/**
 * 즐겨찾기 정류장 카드. 다음 버스 두 대를 카드 안에서 바로 보여준다.
 *
 * 매일 같은 정류장을 확인하는 게 이 앱의 주 용도인데, 정류장을 눌러 들어가야
 * 도착시간을 볼 수 있으면 매번 한 번을 더 눌러야 한다. 홈에서 끝나야 한다.
 */

/** 카드에 보여줄 버스 수. 더 늘리면 즐겨찾기가 여러 개일 때 화면이 길어진다. */
const SHOWN = 2

const URGENT_SECONDS = 180

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  if (seconds < 60) return '곧'
  return `${Math.floor(seconds / 60)}분`
}

export function FavoriteCard({ stop }: { stop: Stop }) {
  const [arrivals, setArrivals] = useState<Arrival[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/arrivals/${stop.nodeid}`)
      const data = (await response.json()) as ArrivalsResponse

      if (!response.ok || data.error) {
        setFailed(true)
        return
      }
      setArrivals(data.arrivals ?? [])
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [stop.nodeid])

  useEffect(() => {
    // setTimeout으로 미뤄 첫 페인트를 막지 않는다. 즐겨찾기가 여러 개면
    // 카드마다 요청이 나가므로 목록이 먼저 그려지는 편이 낫다.
    const initial = setTimeout(load, 0)

    // 홈에서는 주기적 폴링을 하지 않는다. 즐겨찾기가 여러 개면 트래픽이 배로 든다.
    // 화면을 다시 볼 때만 갱신한다.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearTimeout(initial)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  return (
    <Link
      href={`/stop/${stop.nodeid}`}
      className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 active:bg-[var(--color-surface-strong)]"
    >
      <div className="flex items-baseline gap-2">
        <span className="truncate font-semibold">{stop.name}</span>
        <span className="tabular shrink-0 text-sm text-[var(--color-muted)]">
          {stop.nodeno}
        </span>
      </div>

      {arrivals === null && !failed && (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="skeleton h-4 w-40" />
          <div className="skeleton h-4 w-32" />
        </div>
      )}

      {failed && (
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">
          도착정보를 가져오지 못했습니다.
        </p>
      )}

      {arrivals?.length === 0 && (
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">
          도착 예정인 버스가 없습니다.
        </p>
      )}

      {arrivals && arrivals.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {arrivals.slice(0, SHOWN).map((arrival) => (
            <li key={arrival.routeId} className="flex items-center gap-2 text-sm">
              <RouteBadge
                routeNo={arrival.routeNo}
                routeType={arrival.routeType}
              />
              {arrival.destination && (
                <span className="truncate text-[var(--color-muted)]">
                  {shortenPlace(arrival.destination)} 방면
                </span>
              )}
              <span
                className="tabular ml-auto shrink-0 font-semibold"
                style={{
                  color:
                    arrival.correctedSeconds < URGENT_SECONDS
                      ? 'var(--urgent)'
                      : 'var(--foreground)',
                }}
              >
                {formatEta(arrival.correctedSeconds)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  )
}
