'use client'

import { useSyncExternalStore, useCallback } from 'react'
import type { Stop } from './models'

/**
 * 즐겨찾기. 버스는 매일 같은 정류장에서 타므로 이게 가장 자주 쓰는 화면이 된다.
 *
 * localStorage를 외부 스토어로 보고 useSyncExternalStore로 읽는다.
 * effect에서 setState로 동기화하는 방식보다 정확하고(다른 탭의 변경도 반영된다),
 * 서버 렌더 시점의 값을 따로 줄 수 있어 hydration 불일치가 없다.
 *
 * 정류장 전체를 저장한다. id만 저장하면 이름을 보여주려고 366KB짜리
 * 정류소 스냅샷을 클라이언트로 내려보내야 한다.
 */

const KEY = 'ulsan-bus:favorites'

/** 같은 탭 안에서의 변경을 알리는 이벤트. storage 이벤트는 다른 탭에서만 발생한다. */
const CHANGE_EVENT = 'ulsan-bus:favorites-changed'

const EMPTY: Stop[] = []

// getSnapshot은 값이 안 바뀌었으면 반드시 같은 참조를 돌려줘야 한다.
// 매번 새 배열을 만들면 리렌더가 무한히 반복된다.
let cachedRaw: string | null = null
let cachedValue: Stop[] = EMPTY

function read(): Stop[] {
  const raw = localStorage.getItem(KEY)
  if (raw === cachedRaw) return cachedValue

  cachedRaw = raw
  if (!raw) {
    cachedValue = EMPTY
    return cachedValue
  }

  try {
    const parsed = JSON.parse(raw)
    cachedValue = Array.isArray(parsed) ? parsed : EMPTY
  } catch {
    // 저장값이 깨졌으면 조용히 버린다. 즐겨찾기 때문에 앱이 멈추면 안 된다.
    cachedValue = EMPTY
  }
  return cachedValue
}

function write(stops: Stop[]) {
  localStorage.setItem(KEY, JSON.stringify(stops))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, read, () => EMPTY)

  const toggle = useCallback((stop: Stop) => {
    const current = read()
    const exists = current.some((s) => s.nodeid === stop.nodeid)

    write(
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
