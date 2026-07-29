/**
 * 좌표 계산 순수 함수. 서버/클라이언트 양쪽에서 쓴다.
 */

const EARTH_RADIUS_M = 6_371_000

const toRad = (deg: number) => (deg * Math.PI) / 180

/** 두 좌표 사이 거리(미터). haversine. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

/** 도보 거리를 사람이 읽는 형태로. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1)}km`
}

/**
 * 도보 소요 시간(분). 평균 보행 속도 4km/h 기준.
 * 버스를 놓칠지 판단하는 데 쓰이므로 올림한다.
 */
export function walkingMinutes(meters: number): number {
  return Math.ceil(meters / (4000 / 60))
}
