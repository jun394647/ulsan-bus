import { tago } from './tago/client'
import { getSql } from './db'
import type { TagoArrival } from './tago/types'
import type { Arrival } from './models'

export type { Arrival }

/**
 * 도착정보 조회와 관측 기록.
 *
 * 조회 결과는 그대로 arrival_observations에 남긴다. 사용자가 자주 보는 정류장의
 * 관측이 자연히 쌓여서, 3단계에서 보정할 수 있는 정류장이 넓어진다.
 */

const ULSAN_CITY_CODE = 26

export interface ArrivalsResult {
  arrivals: Arrival[]
  /** 이 값을 관측한 시각. 화면에 "몇 시 기준"으로 표시한다. */
  observedAt: Date
}

/**
 * 도착정보 조회. 항상 API에서 직접 받는다.
 *
 * ── DB 캐시를 뒀다가 되돌린 이유
 * 응답 속도를 위해 최근 관측을 재사용해 봤지만, TAGO는 약 2분마다 arrtime을
 * 한꺼번에 갱신하고 그때 값이 크게 점프한다(1823→1453, 143→1041처럼).
 * 그래서 45초짜리 캐시라도 실시간 값과 세대가 달라지고, 실측에서 두 값의
 * 차이가 중앙값 14분까지 벌어졌다.
 *
 * 정확도가 이 프로젝트의 목표인데 속도를 위해 그걸 깎는 것은 본말전도다.
 * TAGO는 평소 90ms 안쪽으로 응답하므로(간헐적으로 4초) 직접 조회로도 충분하다.
 */
export async function getArrivals(nodeId: string): Promise<ArrivalsResult> {
  return fetchFresh(nodeId)
}

async function fetchFresh(nodeId: string): Promise<ArrivalsResult> {
  const rows = await tago.arrivals(ULSAN_CITY_CODE, nodeId)
  const observedAt = new Date()

  const arrivals = rows
    .map((row: TagoArrival) =>
      toArrival({
        routeId: String(row.routeid),
        routeNo: String(row.routeno),
        seconds: Number(row.arrtime),
        remainingStops: Number(row.arrprevstationcnt),
        vehicleType: row.vehicletp,
        routeType: row.routetp,
      }),
    )
    .sort((a, b) => a.correctedSeconds - b.correctedSeconds)

  // 저장 실패가 조회를 막지 않도록 기다리지 않는다.
  void store(nodeId, rows, observedAt)

  return { arrivals, observedAt }
}

/** 사용자 조회로 받은 값도 관측으로 남긴다. 보정 데이터가 그만큼 늘어난다. */
async function store(nodeId: string, rows: TagoArrival[], observedAt: Date) {
  if (rows.length === 0) return

  try {
    const sql = getSql()
    const values = rows.map((row) => ({
      node_id: nodeId,
      route_id: String(row.routeid),
      route_no: String(row.routeno),
      arrtime: Number(row.arrtime),
      prev_stops: Number(row.arrprevstationcnt),
      vehicle_type: row.vehicletp ?? null,
      observed_at: observedAt,
    }))

    await sql`INSERT INTO arrival_observations ${sql(values)}`
  } catch (error) {
    console.error('[arrivals] 관측 저장 실패:', error)
  }
}

function toArrival(input: {
  routeId: string
  routeNo: string
  seconds: number
  remainingStops: number
  vehicleType?: string
  routeType?: string
}): Arrival {
  return {
    routeId: input.routeId,
    routeNo: input.routeNo,
    routeType: input.routeType,
    isLowFloor: String(input.vehicleType ?? '').includes('저상'),
    seconds: input.seconds,
    remainingStops: input.remainingStops,
    // 3단계에서 잔차 보정이 들어갈 자리.
    correctedSeconds: input.seconds,
  }
}

/** 도착예정을 사람이 읽는 형태로. */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds)) return '정보 없음'
  if (seconds < 60) return '곧 도착'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}분`

  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`
}
