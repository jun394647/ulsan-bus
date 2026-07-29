import { tago } from './tago/client'
import { getSql } from './db'
import type { StopRoute } from './models'

/**
 * 정류장을 지나는 노선 목록.
 *
 * 두 가지 쓸모가 있다:
 *  - 막차가 끊긴 시간대에도 "이 정류장에 무슨 버스가 오는지"를 보여줄 수 있다.
 *    도착정보만 있으면 새벽에는 빈 화면이 된다.
 *  - **기점·종점이 들어 있어 방면을 알 수 있다.** 같은 번호의 버스가 양방향으로
 *    지나갈 때 어느 쪽으로 가는지 구분해 준다. 울산 정류소의 47%가 동명이라
 *    이 정보가 특히 중요하다.
 *
 * ── 왜 DB에 캐시하는가
 * 노선 구성은 개편이 있을 때만 바뀌는 사실상 정적 데이터인데, 길찾기는 정류장
 * 여러 곳의 경유노선을 한꺼번에 필요로 한다. 매번 API를 부르면 첫 조회가 16초까지
 * 걸렸다(TAGO가 간헐적으로 4초씩 튀고, 그게 여러 번 겹친다).
 * DB에 두면 한 번 받은 정류장은 이후 모든 요청이 공유한다.
 */

const ULSAN_CITY_CODE = 26

/**
 * 캐시 유효기간. 노선 개편을 반영할 수 있을 만큼 짧고,
 * 매번 다시 받지는 않을 만큼 길게 잡는다.
 */
const CACHE_TTL_DAYS = 14

interface TagoStopRoute {
  routeid: string
  routeno: number | string
  routetp?: string
  startnodenm?: string
  endnodenm?: string
}

interface CachedRow {
  route_id: string
  route_no: string
  route_type: string | null
  start_name: string | null
  end_name: string | null
}

export async function getStopRoutes(nodeId: string): Promise<StopRoute[]> {
  const cached = await readCache(nodeId)
  if (cached) return cached

  const rows = await tago.stopRoutes(ULSAN_CITY_CODE, nodeId)

  const routes = rows
    .map((row: TagoStopRoute) => ({
      routeId: String(row.routeid),
      // routeno에 "731(명촌 출발)"처럼 부가 설명이 붙어 오기도 한다.
      routeNo: String(row.routeno),
      routeType: row.routetp ? String(row.routetp) : undefined,
      start: row.startnodenm ? String(row.startnodenm) : undefined,
      end: row.endnodenm ? String(row.endnodenm) : undefined,
    }))
    .sort((a, b) => compareRouteNo(a.routeNo, b.routeNo))

  // 저장 실패가 조회를 막지 않도록 기다리지 않는다.
  void writeCache(nodeId, routes)

  return routes
}

async function readCache(nodeId: string): Promise<StopRoute[] | null> {
  try {
    const sql = getSql()
    const rows = await sql<CachedRow[]>`
      SELECT route_id, route_no, route_type, start_name, end_name
      FROM stop_routes
      WHERE node_id = ${nodeId}
        AND fetched_at > now() - make_interval(days => ${CACHE_TTL_DAYS})
    `

    if (rows.length === 0) return null

    return rows
      .map((row) => ({
        routeId: row.route_id,
        routeNo: row.route_no,
        routeType: row.route_type ?? undefined,
        start: row.start_name ?? undefined,
        end: row.end_name ?? undefined,
      }))
      .sort((a, b) => compareRouteNo(a.routeNo, b.routeNo))
  } catch (error) {
    // DB가 없거나 죽어도 API 직접 조회로 동작해야 한다.
    console.error('[routes] 캐시 조회 실패, API로 대체합니다:', error)
    return null
  }
}

async function writeCache(nodeId: string, routes: StopRoute[]) {
  if (routes.length === 0) return

  try {
    const sql = getSql()
    const values = routes.map((route) => ({
      node_id: nodeId,
      route_id: route.routeId,
      route_no: route.routeNo,
      route_type: route.routeType ?? null,
      start_name: route.start ?? null,
      end_name: route.end ?? null,
      fetched_at: new Date(),
    }))

    // 이미 있는 노선은 갱신한다. TTL이 지나 다시 받은 경우다.
    await sql`
      INSERT INTO stop_routes ${sql(values)}
      ON CONFLICT (node_id, route_id) DO UPDATE SET
        route_no   = EXCLUDED.route_no,
        route_type = EXCLUDED.route_type,
        start_name = EXCLUDED.start_name,
        end_name   = EXCLUDED.end_name,
        fetched_at = EXCLUDED.fetched_at
    `
  } catch (error) {
    console.error('[routes] 캐시 저장 실패:', error)
  }
}

/** 노선번호를 사람이 기대하는 순서로 정렬한다. "순환31" 같은 문자 포함 번호도 있다. */
function compareRouteNo(a: string, b: string): number {
  const na = Number.parseInt(a, 10)
  const nb = Number.parseInt(b, 10)

  const aIsNum = Number.isFinite(na)
  const bIsNum = Number.isFinite(nb)

  if (aIsNum && bIsNum) return na - nb || a.localeCompare(b, 'ko')
  if (aIsNum) return -1
  if (bIsNum) return 1
  return a.localeCompare(b, 'ko')
}
