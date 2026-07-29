import { getStopRoutes } from './routes'
import { getArrivals } from './arrivals'
import type { Arrival, Stop, StopRoute } from './models'

/**
 * 직통 노선 찾기.
 *
 * 출발지 근처 정류장과 목적지 근처 정류장이 공유하는 노선을 찾는다.
 * 그 노선을 타면 환승 없이 갈 수 있다.
 *
 * ⚠ 한계: 지금은 노선의 정류장 통과 '순서'를 모른다.
 *   그래서 "이 노선이 두 정류장을 모두 지난다"까지만 알 수 있고,
 *   출발 정류장이 목적지보다 앞인지(= 방향이 맞는지)는 확인하지 못한다.
 *   (TAGO 버스노선정보 API가 승인되면 getRouteAcctoThrghSttnList로 순서를 받아
 *   반대 방향을 걸러낼 수 있다. hasDirectionCheck 플래그로 상태를 알린다.)
 *
 *   대신 종점 이름을 함께 보여줘서 사용자가 방향을 판단할 수 있게 한다.
 */

export interface JourneyOption {
  route: StopRoute
  /** 탈 정류장 */
  boardStop: Stop
  /** 내릴 정류장 */
  alightStop: Stop
  /** 탈 정류장까지 걸어가는 거리(m). 출발지 좌표를 알 때만. */
  walkDistance?: number
  /** 이 노선의 도착 예정. 없으면 지금 오는 차가 없다는 뜻. */
  arrival?: Arrival
}

export interface JourneyResult {
  options: JourneyOption[]
  /** 노선 진행 방향까지 검증했는지 */
  hasDirectionCheck: boolean
}

/**
 * 후보 정류장 수 상한.
 * 정류장 하나당 경유노선 조회가 1회씩 나가므로 트래픽에 직접 영향을 준다.
 */
const MAX_ORIGIN_STOPS = 4
const MAX_DESTINATION_STOPS = 3

export async function findJourneys(
  originStops: (Stop & { distance?: number })[],
  destinationStops: Stop[],
): Promise<JourneyResult> {
  const origins = originStops.slice(0, MAX_ORIGIN_STOPS)
  const destinations = destinationStops.slice(0, MAX_DESTINATION_STOPS)

  if (origins.length === 0 || destinations.length === 0) {
    return { options: [], hasDirectionCheck: false }
  }

  // 경유노선은 하루 단위로 캐시되므로 반복 검색에서는 API를 거의 쓰지 않는다.
  const [originRoutes, destinationRoutes] = await Promise.all([
    Promise.all(origins.map((stop) => safeRoutes(stop))),
    Promise.all(destinations.map((stop) => safeRoutes(stop))),
  ])

  const options: JourneyOption[] = []
  const seen = new Set<string>()

  for (const [i, origin] of origins.entries()) {
    for (const [j, destination] of destinations.entries()) {
      const destinationIds = new Map(
        destinationRoutes[j].map((r) => [r.routeId, r]),
      )

      for (const route of originRoutes[i]) {
        if (!destinationIds.has(route.routeId)) continue

        // 같은 노선이 여러 정류장 조합에서 잡히면 가장 가까운 것만 남긴다.
        // (origins가 이미 거리순이므로 먼저 만난 쪽이 더 가깝다)
        if (seen.has(route.routeId)) continue
        seen.add(route.routeId)

        options.push({
          route,
          boardStop: origin,
          alightStop: destination,
          walkDistance: origin.distance,
        })
      }
    }
  }

  // 탈 정류장의 도착정보를 붙인다. 정류장 단위로 묶어 중복 조회를 피한다.
  const boardStopIds = [...new Set(options.map((o) => o.boardStop.nodeid))]
  const arrivalsByStop = new Map<string, Arrival[]>()

  await Promise.all(
    boardStopIds.map(async (nodeid) => {
      try {
        const result = await getArrivals(nodeid)
        arrivalsByStop.set(nodeid, result.arrivals)
      } catch {
        arrivalsByStop.set(nodeid, [])
      }
    }),
  )

  for (const option of options) {
    option.arrival = arrivalsByStop
      .get(option.boardStop.nodeid)
      ?.find((a) => a.routeId === option.route.routeId)
  }

  // 지금 오는 버스가 먼저, 그 안에서는 빨리 오는 순.
  options.sort((a, b) => {
    if (a.arrival && b.arrival) {
      return a.arrival.correctedSeconds - b.arrival.correctedSeconds
    }
    if (a.arrival) return -1
    if (b.arrival) return 1
    // 둘 다 대기 중이면 걸어가는 거리가 짧은 쪽.
    return (a.walkDistance ?? 0) - (b.walkDistance ?? 0)
  })

  return { options, hasDirectionCheck: false }
}

/** 한 정류장의 경유노선 조회가 실패해도 전체 검색은 계속되어야 한다. */
async function safeRoutes(stop: Stop): Promise<StopRoute[]> {
  try {
    return await getStopRoutes(stop.nodeid)
  } catch (error) {
    console.error('[journey] 경유노선 조회 실패', stop.nodeid, error)
    return []
  }
}
