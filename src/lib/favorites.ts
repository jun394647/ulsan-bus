'use client'

import { useCallback } from 'react'
import type { Stop } from './models'
import { createLocalStore } from './local-store'

/**
 * 즐겨찾기. 버스는 매일 같은 정류장에서 타므로 이게 가장 자주 쓰는 화면이 된다.
 *
 * 정류장 전체를 저장한다. id만 저장하면 이름을 보여주려고 366KB짜리
 * 정류소 스냅샷을 클라이언트로 내려보내야 한다.
 */
const store = createLocalStore<Stop>('ulsan-bus:favorites')

export function useFavorites() {
  const favorites = store.useValue()

  const toggle = useCallback((stop: Stop) => {
    const current = store.read()
    const exists = current.some((s) => s.nodeid === stop.nodeid)

    store.write(
      exists
        ? current.filter((s) => s.nodeid !== stop.nodeid)
        : [...current, { ...stop }],
    )
  }, [])

  const isFavorite = useCallback(
    (nodeid: string) => favorites.some((s) => s.nodeid === nodeid),
    [favorites],
  )

  return { favorites, toggle, isFavorite }
}
