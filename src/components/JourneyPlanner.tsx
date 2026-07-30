'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import type { Arrival, Stop, StopRoute } from '@/lib/models'
import { formatDistance, walkingMinutes } from '@/lib/geo'
import { RouteBadge, RouteTypeLabel } from './RouteBadge'

interface JourneyOption {
  route: StopRoute
  boardStop: Stop
  alightStop: Stop
  walkDistance?: number
  arrival?: Arrival
}

interface JourneyResponse {
  options?: JourneyOption[]
  hasDirectionCheck?: boolean
  error?: string
}

type State =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'done'; options: JourneyOption[]; hasDirectionCheck: boolean }
  | { status: 'error'; message: string }

function formatEta(seconds: number): string {
  if (seconds < 60) return '곧 도착'
  return `${Math.floor(seconds / 60)}분`
}

export function JourneyPlanner() {
  const [destination, setDestination] = useState('')
  const [state, setState] = useState<State>({ status: 'idle' })

  const search = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()

      const to = destination.trim()
      if (!to) return

      setState({ status: 'searching' })

      const run = async (lat?: number, lng?: number) => {
        try {
          const params = new URLSearchParams({ to })
          if (lat !== undefined && lng !== undefined) {
            params.set('lat', String(lat))
            params.set('lng', String(lng))
          }

          const response = await fetch(`/api/journey?${params}`)
          const data = (await response.json()) as JourneyResponse

          if (!response.ok || data.error) {
            setState({ status: 'error', message: data.error ?? '길찾기에 실패했습니다.' })
            return
          }

          setState({
            status: 'done',
            options: data.options ?? [],
            hasDirectionCheck: data.hasDirectionCheck ?? false,
          })
        } catch {
          setState({ status: 'error', message: '네트워크 오류가 발생했습니다.' })
        }
      }

      navigator.geolocation.getCurrentPosition(
        ({ coords }) => void run(coords.latitude, coords.longitude),
        () =>
          setState({
            status: 'error',
            message: '현재 위치를 알 수 없어 출발지를 정할 수 없습니다.',
          }),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      )
    },
    [destination],
  )

  return (
    <div className="flex flex-1 flex-col pb-6">
      <form onSubmit={search} className="flex gap-2 px-4">
        <input
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          placeholder="어디로 가세요?"
          className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button
          type="submit"
          disabled={!destination.trim() || state.status === 'searching'}
          className="shrink-0 rounded-xl bg-[var(--color-accent)] px-4 py-3 font-semibold text-white disabled:opacity-40"
        >
          {state.status === 'searching' ? '찾는 중' : '찾기'}
        </button>
      </form>

      <p className="px-4 pt-2 text-xs text-[var(--color-muted)]">
        현재 위치에서 환승 없이 갈 수 있는 버스를 찾습니다.
      </p>

      <Results state={state} />
    </div>
  )
}

function Results({ state }: { state: State }) {
  if (state.status === 'idle') return null

  if (state.status === 'searching') {
    return (
      <div className="flex flex-col gap-2 px-4 pt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-[92px] w-full" />
        ))}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <p className="mx-4 mt-4 rounded-xl bg-[var(--color-urgent-surface)] px-4 py-3 text-sm text-[var(--color-urgent)]">
        {state.message}
      </p>
    )
  }

  if (state.options.length === 0) {
    return (
      <p className="px-4 py-10 text-center leading-relaxed text-[var(--color-muted)]">
        환승 없이 갈 수 있는 버스가 없습니다.
        <br />
        목적지 이름을 다르게 입력해 보세요.
      </p>
    )
  }

  return (
    <>
      {!state.hasDirectionCheck && (
        <p className="mx-4 mt-4 rounded-xl bg-[var(--color-surface)] px-4 py-3 text-xs leading-relaxed text-[var(--color-muted)]">
          두 정류장을 모두 지나는 노선을 찾은 결과입니다. 진행 방향은 아직 확인하지
          못하므로, 아래 <b>방면</b>을 보고 반대편이 아닌지 확인해 주세요.
        </p>
      )}

      <ul className="flex flex-col gap-2 px-4 pt-4">
        {state.options.map((option) => (
          <li key={option.route.routeId}>
            <Link
              href={`/stop/${option.boardStop.nodeid}`}
              className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 active:bg-[var(--color-surface-strong)]"
            >
              <div className="flex items-center gap-2">
                <RouteBadge
                  routeNo={option.route.routeNo}
                  routeType={option.route.routeType}
                  size="lg"
                />
                <RouteTypeLabel routeType={option.route.routeType} />

                <span className="tabular ml-auto shrink-0 font-bold">
                  {option.arrival ? (
                    <span
                      style={{
                        color:
                          option.arrival.correctedSeconds < 180
                            ? 'var(--urgent)'
                            : 'var(--foreground)',
                      }}
                    >
                      {formatEta(option.arrival.correctedSeconds)}
                    </span>
                  ) : (
                    <span className="text-sm font-normal text-[var(--color-muted)]">
                      대기 중
                    </span>
                  )}
                </span>
              </div>

              {option.route.end && (
                <div className="mt-1 text-sm text-[var(--color-muted)]">
                  {option.route.end} 방면
                </div>
              )}

              <div className="mt-2.5 flex flex-col gap-1 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--color-muted)]">승차</span>
                  <span className="truncate font-medium">{option.boardStop.name}</span>
                  {option.walkDistance !== undefined && (
                    <span className="tabular shrink-0 text-[var(--color-muted)]">
                      · 도보 {walkingMinutes(option.walkDistance)}분(
                      {formatDistance(option.walkDistance)})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--color-muted)]">하차</span>
                  <span className="truncate font-medium">{option.alightStop.name}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
