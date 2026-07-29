import { getSql } from './db'
import { tago, getCallCount } from './tago/client'

/**
 * 도착 예측 로그 수집.
 *
 * 추적 대상 정류장을 한 바퀴 돌며 도착정보를 받아 원본 그대로 저장한다.
 * 판정이나 가공은 하지 않는다 — 그건 나중에 데이터를 보고 정한다.
 *
 * ── 차량번호가 없다는 문제
 * 계획서는 차량번호로 개별 버스를 추적해 도착을 판정하려 했지만,
 * TAGO 도착정보에는 차량번호가 없다(있는 쪽은 울산 BIS인데 한도가 1,000회/일이라
 * 정류장 1~2개밖에 못 본다). 그래서 궤적은 나중에 arrtime이 단조 감소하는
 * 연속 관측을 이어 붙이는 방식으로 재구성한다. 그러려면 폴링 간격이 촘촘하고
 * 관측 시각이 정확해야 한다 — 이 함수가 보장해야 할 것은 그 두 가지다.
 */

const ULSAN_CITY_CODE = 26

/**
 * 동시에 조회할 정류장 수.
 *
 * TAGO는 동시 세션이 차면 "[99] 가용한 세션이 존재하지 않습니다 (30/30)"를 돌려준다.
 * 이 한도는 우리 요청만으로 차는 게 아니라서 동시성을 낮게 잡는 편이 안전하다.
 * 정류장이 몇 개뿐이라 한 바퀴는 어차피 금방 돈다.
 */
const CONCURRENCY = 2

export interface CollectionResult {
  runId: number
  stopsPolled: number
  observations: number
  apiCalls: number
  errors: number
}

interface TrackedStop {
  node_id: string
  name: string
}

export async function collect(): Promise<CollectionResult> {
  const sql = getSql()
  const callsBefore = getCallCount()

  const [run] = await sql<{ id: number }[]>`
    INSERT INTO collection_runs DEFAULT VALUES RETURNING id
  `

  const stops = await sql<TrackedStop[]>`
    SELECT node_id, name FROM tracked_stops WHERE active ORDER BY node_id
  `

  let observations = 0
  let errors = 0
  const errorMessages: string[] = []

  // 정류장을 CONCURRENCY개씩 묶어 처리한다.
  for (let i = 0; i < stops.length; i += CONCURRENCY) {
    const batch = stops.slice(i, i + CONCURRENCY)

    const results = await Promise.all(
      batch.map(async (stop) => {
        try {
          const rows = await tago.arrivals(ULSAN_CITY_CODE, stop.node_id)

          // 관측 시각은 응답을 받은 직후로 잡는다. arrtime의 기준점이므로
          // 저장 시점(now())을 쓰면 DB 왕복 시간만큼 밀린다.
          const observedAt = new Date()

          if (rows.length === 0) return 0

          const values = rows.map((row) => ({
            node_id: stop.node_id,
            route_id: String(row.routeid),
            route_no: String(row.routeno),
            arrtime: Number(row.arrtime),
            prev_stops: Number(row.arrprevstationcnt),
            vehicle_type: row.vehicletp ?? null,
            observed_at: observedAt,
          }))

          await sql`INSERT INTO arrival_observations ${sql(values)}`
          return values.length
        } catch (error) {
          errors++
          const message = error instanceof Error ? error.message : String(error)
          errorMessages.push(`${stop.name}(${stop.node_id}): ${message}`)
          return 0
        }
      }),
    )

    observations += results.reduce((sum, n) => sum + n, 0)
  }

  const apiCalls = getCallCount() - callsBefore

  await sql`
    UPDATE collection_runs SET
      finished_at  = now(),
      stops_polled = ${stops.length},
      observations = ${observations},
      api_calls    = ${apiCalls},
      errors       = ${errors},
      error_detail = ${errorMessages.length > 0 ? errorMessages.join('\n') : null}
    WHERE id = ${run.id}
  `

  return {
    runId: run.id,
    stopsPolled: stops.length,
    observations,
    apiCalls,
    errors,
  }
}
