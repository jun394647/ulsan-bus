import Link from 'next/link'
import type { NearbyStop, Stop } from '@/lib/models'
import { formatDistance, walkingMinutes } from '@/lib/geo'

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between px-4 pt-6 pb-2">
      <h2 className="text-sm font-semibold text-[var(--color-muted)]">{children}</h2>
      {action}
    </div>
  )
}

/**
 * 정류소 목록.
 *
 * 울산 정류소의 47%가 동명이라(1,701개) 이름만으로는 어느 쪽인지 알 수 없다.
 * 정류소 번호를 항상 함께 보여주고, 위치를 알 때는 거리와 도보 시간을 덧붙인다.
 */
export function StopList({
  stops,
  emptyMessage = '정류장이 없습니다.',
}: {
  stops: (Stop | NearbyStop)[]
  emptyMessage?: string
}) {
  if (stops.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[var(--color-muted)]">
        {emptyMessage}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2 px-4">
      {stops.map((stop) => {
        const distance = 'distance' in stop ? stop.distance : undefined

        return (
          <li key={stop.nodeid}>
            <Link
              href={`/stop/${stop.nodeid}`}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 transition-colors active:bg-[var(--color-surface-strong)]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{stop.name}</div>
                <div className="tabular mt-0.5 text-sm text-[var(--color-muted)]">
                  {stop.nodeno}
                </div>
              </div>

              {distance !== undefined && (
                <div className="tabular shrink-0 text-right text-sm">
                  <div className="font-medium">{formatDistance(distance)}</div>
                  <div className="mt-0.5 text-[var(--color-muted)]">
                    도보 {walkingMinutes(distance)}분
                  </div>
                </div>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
