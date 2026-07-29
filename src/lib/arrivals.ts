import { tago } from './tago/client'
import type { TagoArrival } from './tago/types'

/**
 * 도착정보를 앱 모델로 정규화한다.
 *
 * 지금은 TAGO 원본을 그대로 쓴다. 2단계에서 예측/실제 잔차를 쌓고,
 * 3단계에서 여기에 보정을 끼워 넣는다. 그때 `corrected` 필드가 채워진다.
 */

const ULSAN_CITY_CODE = 26

import type { Arrival } from './models'

export type { Arrival }

export async function getArrivals(nodeId: string): Promise<Arrival[]> {
  const rows = await tago.arrivals(ULSAN_CITY_CODE, nodeId)
  return rows.map(normalize).sort((a, b) => a.correctedSeconds - b.correctedSeconds)
}

function normalize(row: TagoArrival): Arrival {
  const seconds = Number(row.arrtime)

  return {
    routeId: String(row.routeid),
    routeNo: String(row.routeno),
    routeType: row.routetp ? String(row.routetp) : undefined,
    isLowFloor: String(row.vehicletp ?? '').includes('저상'),
    seconds,
    remainingStops: Number(row.arrprevstationcnt),
    // 3단계에서 잔차 보정이 들어갈 자리.
    correctedSeconds: seconds,
  }
}

/** 도착예정을 사람이 읽는 형태로. */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '정보 없음'
  if (seconds < 60) return '곧 도착'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}분`

  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`
}
