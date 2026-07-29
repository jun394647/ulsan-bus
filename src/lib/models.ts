/**
 * 서버와 클라이언트가 함께 쓰는 모델 타입.
 *
 * stops.ts는 366KB짜리 스냅샷 JSON을 import하므로 클라이언트에서 건드리면 안 된다.
 * 타입만 필요한 쪽은 이 파일을 쓴다.
 */

export interface Stop {
  nodeid: string
  nodeno: number
  name: string
  lat: number
  lng: number
}

export interface NearbyStop extends Stop {
  /** 사용자 위치로부터의 직선거리(미터) */
  distance: number
}

export interface Arrival {
  routeId: string
  routeNo: string
  routeType?: string
  isLowFloor: boolean
  /** 원본 도착예정 [초] */
  seconds: number
  remainingStops: number
  /** 보정된 도착예정 [초]. 3단계 전까지는 seconds와 같다. */
  correctedSeconds: number
}

export interface ArrivalsResponse {
  stop: Stop
  arrivals?: Arrival[]
  fetchedAt?: string
  error?: string
}
