'use client'

import { useCallback } from 'react'
import type { Stop } from './models'
import { createLocalStore } from './local-store'

/**
 * 최근 본 정류장.
 *
 * 즐겨찾기까지 등록하지는 않지만 방금 확인했던 정류장을 다시 열게 되는 일이 잦다.
 * 검색을 다시 하지 않아도 되게 한다.
 */
const store = createLocalStore<Stop>('ulsan-bus:recent')

/**
 * 너무 길면 목록이 오히려 방해가 된다. 홈에는 즐겨찾기와 가까운 정류장도
 * 함께 놓이므로, 최근 목록이 화면을 밀어내지 않을 만큼만 남긴다.
 */
const MAX_ITEMS = 3

export function useRecentStops() {
  const recent = store.useValue()

  const record = useCallback((stop: Stop) => {
    const current = store.read()

    // 이미 있으면 맨 앞으로 옮긴다.
    const next = [stop, ...current.filter((s) => s.nodeid !== stop.nodeid)]

    // 같은 값이면 쓰지 않는다. 불필요한 렌더와 storage 이벤트를 막는다.
    if (
      current.length === next.length &&
      current.every((s, i) => s.nodeid === next[i].nodeid)
    ) {
      return
    }

    store.write(next.slice(0, MAX_ITEMS))
  }, [])

  const clear = useCallback(() => store.write([]), [])

  return { recent, record, clear }
}
