'use client'

import { useEffect } from 'react'
import { useRecentStops } from '@/lib/recent'
import type { Stop } from '@/lib/models'

/**
 * 정류장을 열었다는 사실만 기록한다. 화면에는 아무것도 그리지 않는다.
 *
 * record는 localStorage에 쓰고 이벤트를 쏠 뿐 React 상태를 직접 건드리지 않으므로
 * effect에서 불러도 "effect 안 setState" 규칙에 걸리지 않는다.
 */
export function RecordVisit({ stop }: { stop: Stop }) {
  const { record } = useRecentStops()

  useEffect(() => {
    record(stop)
  }, [record, stop])

  return null
}
