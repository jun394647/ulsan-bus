'use client'

import { useCallback, useRef, useState } from 'react'
import type { Arrival } from './models'

/**
 * 도착 임박 알림.
 *
 * ── 범위와 한계
 * 브라우저 알림은 이 탭이 살아 있을 때만 동작한다. 탭을 닫으면 알림도 사라진다.
 * 진짜 백그라운드 푸시는 Service Worker + Web Push(VAPID 키, 서버 저장)가 필요한데,
 * "집에서 나가기 전에 확인해두고 알림 받기"라는 주 용도에는 탭 유지만으로도 충분하다.
 * 화면에 이 제약을 분명히 알린다.
 *
 * 알림 조건을 만족하면 한 번만 울리고 해제한다. 같은 버스로 반복해서 울리면
 * 오히려 방해가 된다.
 */

/** 기본 알림 시점. 정류장까지 걸어갈 시간을 감안한 값. */
export const DEFAULT_LEAD_SECONDS = 180

export type NotifyPermission = 'unsupported' | 'default' | 'granted' | 'denied'

export function getPermission(): NotifyPermission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as NotifyPermission
}

export function useArrivalAlerts(stopName: string) {
  /** 알림을 걸어둔 routeId 집합 */
  const [watched, setWatched] = useState<Set<string>>(new Set())
  const [permission, setPermission] = useState<NotifyPermission>('default')

  // 이미 울린 노선은 다시 울리지 않는다.
  const fired = useRef<Set<string>>(new Set())

  /*
   * check가 watched를 직접 참조하면 알림을 켤 때마다 함수가 새로 만들어진다.
   * 그 함수를 쓰는 쪽(도착정보 갱신 로직)의 의존성이 바뀌면서 30초 폴링 타이머가
   * 리셋되므로, 알림을 켠 직후 갱신이 밀린다. ref로 읽어 참조를 고정한다.
   */
  const watchedRef = useRef(watched)

  const updateWatched = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      setWatched((prev) => {
        const next = updater(prev)
        watchedRef.current = next
        return next
      })
    },
    [],
  )

  const toggle = useCallback(async (routeId: string) => {
    const current = getPermission()

    if (current === 'unsupported') {
      setPermission('unsupported')
      return
    }

    if (current === 'default') {
      const asked = await Notification.requestPermission()
      setPermission(asked as NotifyPermission)
      if (asked !== 'granted') return
    } else {
      setPermission(current)
      if (current === 'denied') return
    }

    updateWatched((prev) => {
      const next = new Set(prev)
      if (next.has(routeId)) {
        next.delete(routeId)
        fired.current.delete(routeId)
      } else {
        next.add(routeId)
      }
      return next
    })
  }, [updateWatched])

  /**
   * 도착정보가 갱신될 때마다 호출한다.
   * 지켜보는 노선이 임박하면 알림을 띄우고 감시를 해제한다.
   */
  const check = useCallback(
    (arrivals: Arrival[], leadSeconds = DEFAULT_LEAD_SECONDS) => {
      const watching = watchedRef.current
      if (watching.size === 0 || getPermission() !== 'granted') return

      const done: string[] = []

      for (const arrival of arrivals) {
        if (!watching.has(arrival.routeId)) continue
        if (fired.current.has(arrival.routeId)) continue
        if (arrival.correctedSeconds > leadSeconds) continue

        const minutes = Math.max(0, Math.round(arrival.correctedSeconds / 60))
        new Notification(`${arrival.routeNo}번 곧 도착`, {
          body:
            minutes <= 0
              ? `${stopName}에 도착합니다.`
              : `${stopName}에 약 ${minutes}분 후 도착합니다.`,
          tag: `arrival-${arrival.routeId}`,
          icon: '/icon.svg',
        })

        fired.current.add(arrival.routeId)
        done.push(arrival.routeId)
      }

      // 울린 노선은 감시 목록에서 뺀다.
      if (done.length > 0) {
        updateWatched((prev) => {
          const next = new Set(prev)
          for (const id of done) next.delete(id)
          return next
        })
      }
    },
    [stopName, updateWatched],
  )

  return { watched, permission, toggle, check }
}
