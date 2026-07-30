import { tago } from './tago/client'
import { getSql } from './db'
import type { TagoArrival } from './tago/types'
import type { Arrival } from './models'

export type { Arrival }

/**
 * 도착정보 조회.
 *
 * ── 왜 DB를 먼저 보는가
 * TAGO는 평소 90ms 안쪽으로 빠르지만 간헐적으로 4초 가까이 튄다(8회 중 2회 관측).
 * 평균이 아니라 이 꼬리가 체감 속도를 지배한다.
 *
 * 추적 중인 정류장은 수집기가 2분마다 채워 넣고 있으므로, 그 값을 쓰면
 * 77ms로 안정적으로 답할 수 있다. 관측 이후 흐른 시간만큼 arrtime을 빼면
 * 지금 시점의 예상 도착까지 남은 시간이 되므로 오래된 값도 그대로 쓸 수 있다.
 *
 * ── 부수 효과
 * 캐시가 없어 TAGO를 부르면 그 결과도 저장한다. 사용자가 자주 보는 정류장의
 * 관측이 자연히 쌓여서, 나중에 보정할 수 있는 정류장이 늘어난다.
 */

const ULSAN_CITY_CODE = 26

/**
 * 캐시를 쓸 수 있는 최대 나이.
 *
 * 짧게 잡는 이유: 관측 시각으로부터 경과한 만큼 arrtime을 빼서 쓰지만,
 * 버스 예측은 선형이 아니다. 100초 전 "5분 후"가 지금 "2분 후"로 갱신됐을 수 있는데
 * 단순 차감은 그 갱신을 놓친다. 결과적으로 화면이 실제보다 뒤처져 보인다.
 *
 * 그래서 캐시는 "첫 화면을 즉시 띄우는 용도"로만 쓰고, 곧바로 실시간 값으로
 * 갈아끼운다(fetchFresh). 이 값은 그 즉시성의 허용 오차다.
 */
const CACHE_MAX_AGE_SECONDS = 45

export interface ArrivalsResult {
  arrivals: Arrival[]
  /** 이 값을 관측한 시각. 화면에 "몇 시 기준"으로 표시한다. */
  observedAt: Date
  /** DB의 기존 관측을 재사용했는지 (false면 방금 API에서 받아온 것) */
  fromCache: boolean
}

interface CachedRow {
  route_id: string
  route_no: string
  arrtime: number
  prev_stops: number
  vehicle_type: string | null
  observed_at: Date
}

/**
 * @param options.fresh 캐시를 건너뛰고 API에서 직접 받는다.
 *   클라이언트가 첫 화면을 띄운 직후 정확한 값으로 갱신할 때 쓴다.
 */
export async function getArrivals(
  nodeId: string,
  options: { fresh?: boolean } = {},
): Promise<ArrivalsResult> {
  if (!options.fresh) {
    const cached = await readRecent(nodeId)
    if (cached) return cached
  }

  return fetchFresh(nodeId)
}

/** 최근 폴링 한 회차분을 읽는다. 없거나 오래됐으면 null. */
async function readRecent(nodeId: string): Promise<ArrivalsResult | null> {
  try {
    const sql = getSql()

    // 마지막 폴링 시각을 먼저 찾고 그 회차의 행만 가져온다.
    // 시간 범위로 자르면 여러 회차가 섞여 같은 노선이 중복된다.
    const rows = await sql<CachedRow[]>`
      SELECT route_id, route_no, arrtime, prev_stops, vehicle_type, observed_at
      FROM arrival_observations
      WHERE node_id = ${nodeId}
        AND observed_at = (
          SELECT max(observed_at) FROM arrival_observations
          WHERE node_id = ${nodeId}
            AND observed_at > now() - make_interval(secs => ${CACHE_MAX_AGE_SECONDS})
        )
    `

    if (rows.length === 0) return null

    const observedAt = rows[0].observed_at
    const elapsed = (Date.now() - observedAt.getTime()) / 1000

    const arrivals = rows
      .map((row) => {
        // 관측 이후 흐른 만큼 빼야 지금 기준의 남은 시간이 된다.
        const seconds = Math.round(row.arrtime - elapsed)
        return toArrival({
          routeId: row.route_id,
          routeNo: row.route_no,
          seconds,
          remainingStops: row.prev_stops,
          vehicleType: row.vehicle_type ?? undefined,
        })
      })
      // 이미 지나간 버스는 뺀다.
      .filter((arrival) => arrival.seconds > -30)
      .sort((a, b) => a.correctedSeconds - b.correctedSeconds)

    return { arrivals, observedAt, fromCache: true }
  } catch (error) {
    // DB가 없거나 죽어도 앱은 동작해야 한다. API 직접 조회로 넘어간다.
    console.error('[arrivals] 캐시 조회 실패, API로 대체합니다:', error)
    return null
  }
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

  return { arrivals, observedAt, fromCache: false }
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
