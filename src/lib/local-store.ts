'use client'

import { useSyncExternalStore } from 'react'

/**
 * localStorage에 담긴 배열을 React 상태처럼 읽는 스토어.
 *
 * effect에서 setState로 동기화하는 방식보다 나은 점:
 *  - 다른 탭에서 바꾼 값도 반영된다
 *  - 서버 렌더 시점의 값을 따로 줄 수 있어 hydration이 어긋나지 않는다
 *  - React 19의 "effect 안에서 setState 금지" 규칙에 걸리지 않는다
 */

export interface LocalStore<T> {
  useValue: () => T[]
  read: () => T[]
  write: (items: T[]) => void
}

export function createLocalStore<T>(key: string): LocalStore<T> {
  const EMPTY: T[] = []
  const changeEvent = `local-store:${key}`

  // getSnapshot은 값이 그대로면 반드시 같은 참조를 돌려줘야 한다.
  // 매번 새 배열을 만들면 리렌더가 무한히 반복된다.
  let cachedRaw: string | null = null
  let cachedValue: T[] = EMPTY

  const read = (): T[] => {
    const raw = localStorage.getItem(key)
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
      // 저장값이 깨졌으면 조용히 버린다. 이것 때문에 앱이 멈추면 안 된다.
      cachedValue = EMPTY
    }
    return cachedValue
  }

  const write = (items: T[]) => {
    localStorage.setItem(key, JSON.stringify(items))
    // storage 이벤트는 다른 탭에서만 발생하므로 같은 탭용 신호를 따로 쏜다.
    window.dispatchEvent(new Event(changeEvent))
  }

  const subscribe = (onChange: () => void) => {
    window.addEventListener('storage', onChange)
    window.addEventListener(changeEvent, onChange)
    return () => {
      window.removeEventListener('storage', onChange)
      window.removeEventListener(changeEvent, onChange)
    }
  }

  return {
    useValue: () => useSyncExternalStore(subscribe, read, () => EMPTY),
    read,
    write,
  }
}
