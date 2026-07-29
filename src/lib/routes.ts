import { tago } from './tago/client'
import type { StopRoute } from './models'

/**
 * 정류장을 지나는 노선 목록.
 *
 * 도착 예정 정보와 다른 두 가지 쓸모가 있다:
 *  - 막차가 끊긴 시간대에도 "이 정류장에 무슨 버스가 오는지"를 보여줄 수 있다.
 *    도착정보만 있으면 새벽에는 빈 화면이 된다.
 *  - **기점·종점이 들어 있어 방면을 알 수 있다.** 같은 번호의 버스가 양방향으로
 *    지나갈 때 어느 쪽으로 가는지 구분해 준다. 울산 정류소의 47%가 동명이라
 *    이 정보가 특히 중요하다.
 */

const ULSAN_CITY_CODE = 26

interface TagoStopRoute {
  routeid: string
  routeno: number | string
  routetp?: string
  startnodenm?: string
  endnodenm?: string
}

export async function getStopRoutes(nodeId: string): Promise<StopRoute[]> {
  const rows = await tago.stopRoutes(ULSAN_CITY_CODE, nodeId)

  return rows
    .map((row: TagoStopRoute) => ({
      routeId: String(row.routeid),
      // routeno에 "731(명촌 출발)"처럼 부가 설명이 붙어 오기도 한다.
      routeNo: String(row.routeno),
      routeType: row.routetp ? String(row.routetp) : undefined,
      start: row.startnodenm ? String(row.startnodenm) : undefined,
      end: row.endnodenm ? String(row.endnodenm) : undefined,
    }))
    .sort((a, b) => compareRouteNo(a.routeNo, b.routeNo))
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
