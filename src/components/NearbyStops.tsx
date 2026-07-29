'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { NearbyStop, Stop } from '@/lib/models'
import { useFavorites } from '@/lib/favorites'
import { useRecentStops } from '@/lib/recent'
import { SectionTitle, StopList } from './StopList'

// Leaflet은 window에 의존해 서버에서 평가될 수 없다.
// 지도 번들(약 150KB)이 첫 로드를 늦추지 않는 효과도 있다.
const StopMap = dynamic(() => import('./StopMap'), {
  ssr: false,
  loading: () => <div className="skeleton h-[260px] w-full" />,
})

type LocationState =
  | { status: 'locating' }
  | { status: 'ready'; stops: NearbyStop[] }
  | { status: 'denied' }
  | { status: 'error'; message: string }

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 30_000,
}

export function NearbyStops() {
  // 마운트되면 바로 위치를 찾으므로 초기 상태가 곧 locating이다.
  const [location, setLocation] = useState<LocationState>({ status: 'locating' })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<(Stop | NearbyStop)[]>([])

  // 검색할 때도 좌표를 넘겨 동명 정류소를 거리순으로 보여준다.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  const handlePosition = useCallback(async ({ coords }: GeolocationPosition) => {
    setCoords({ lat: coords.latitude, lng: coords.longitude })

    try {
      const response = await fetch(
        `/api/stops/nearby?lat=${coords.latitude}&lng=${coords.longitude}`,
      )
      if (!response.ok) throw new Error('정류장을 불러오지 못했습니다.')

      const data = (await response.json()) as { stops: NearbyStop[] }
      setLocation({ status: 'ready', stops: data.stops })
    } catch (error) {
      setLocation({
        status: 'error',
        message: error instanceof Error ? error.message : '알 수 없는 오류',
      })
    }
  }, [])

  const handleGeoError = useCallback((error: GeolocationPositionError) => {
    // 사용자가 거부한 경우는 재시도해도 소용없으므로 검색으로 유도한다.
    setLocation(
      error.code === error.PERMISSION_DENIED
        ? { status: 'denied' }
        : { status: 'error', message: '위치를 확인하지 못했습니다.' },
    )
  }, [])

  /**
   * 이 함수는 setState를 동기적으로 부르지 않는다. 상태 변경은 전부
   * geolocation 콜백에서 일어나므로 effect에서 호출해도 안전하다.
   */
  const locate = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      handlePosition,
      handleGeoError,
      GEO_OPTIONS,
    )
  }, [handlePosition, handleGeoError])

  useEffect(() => {
    locate()
  }, [locate])

  // 검색어 입력 시 정류장 이름/번호로 조회한다.
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) return

    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ q: trimmed })
      if (coords) {
        params.set('lat', String(coords.lat))
        params.set('lng', String(coords.lng))
      }

      const response = await fetch(`/api/stops/nearby?${params}`)
      if (!response.ok) return
      const data = (await response.json()) as { stops: (Stop | NearbyStop)[] }
      setResults(data.stops)
    }, 200)

    return () => clearTimeout(timer)
  }, [query, coords])

  // 검색 중인지는 입력값에서 바로 파생시킨다. 별도 상태를 두지 않는다.
  const isSearching = query.trim().length > 0

  return (
    <div className="flex flex-1 flex-col pb-10">
      <div className="px-4 pb-1">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="정류장 이름 또는 번호"
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
          // 모바일 자동 대문자/교정이 한글 입력을 방해한다.
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>

      {isSearching ? (
        <>
          <SectionTitle>검색 결과</SectionTitle>
          <StopList stops={results} emptyMessage="일치하는 정류장이 없습니다." />
        </>
      ) : (
        <>
          <FavoriteSection />
          <RecentSection />
          <SectionTitle>가까운 정류장</SectionTitle>
          {coords && location.status === 'ready' && location.stops.length > 0 && (
            <div className="px-4 pb-3">
              <StopMap center={coords} stops={location.stops} />
            </div>
          )}
          <NearbyContent state={location} onRetry={locate} />
        </>
      )}
    </div>
  )
}

/** 비어 있으면 섹션 자체를 감춘다. 빈 영역이 화면을 밀어내지 않도록. */
function FavoriteSection() {
  const { favorites } = useFavorites()
  if (favorites.length === 0) return null

  return (
    <>
      <SectionTitle>즐겨찾기</SectionTitle>
      <StopList stops={favorites} />
    </>
  )
}

function RecentSection() {
  const { recent, clear } = useRecentStops()
  const { favorites } = useFavorites()

  // 즐겨찾기에 이미 있는 정류장은 바로 위에 보이므로 중복해서 싣지 않는다.
  const favoriteIds = new Set(favorites.map((s) => s.nodeid))
  const items = recent.filter((s) => !favoriteIds.has(s.nodeid))

  if (items.length === 0) return null

  return (
    <>
      <SectionTitle
        action={
          <button
            onClick={clear}
            className="text-sm text-[var(--color-muted)] active:text-[var(--color-foreground)]"
          >
            지우기
          </button>
        }
      >
        최근 본 정류장
      </SectionTitle>
      <StopList stops={items} />
    </>
  )
}

function NearbyContent({
  state,
  onRetry,
}: {
  state: LocationState
  onRetry: () => void
}) {
  switch (state.status) {
    case 'locating':
      return (
        <div className="flex flex-col gap-2 px-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[70px] w-full" />
          ))}
        </div>
      )

    case 'ready':
      return state.stops.length === 0 ? (
        <p className="px-4 py-8 text-center leading-relaxed text-[var(--color-muted)]">
          1km 안에 정류장이 없습니다.
          <br />
          위에서 이름으로 검색해 보세요.
        </p>
      ) : (
        <StopList stops={state.stops} />
      )

    case 'denied':
      return (
        <p className="px-4 py-8 text-center leading-relaxed text-[var(--color-muted)]">
          위치 권한이 거부되어 가까운 정류장을 찾을 수 없습니다.
          <br />
          위에서 이름으로 검색해 주세요.
        </p>
      )

    case 'error':
      return (
        <div className="px-4 py-8 text-center">
          <p className="text-[var(--color-muted)]">{state.message}</p>
          <button
            onClick={onRetry}
            className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 font-medium active:bg-[var(--color-surface-strong)]"
          >
            다시 시도
          </button>
        </div>
      )
  }
}
