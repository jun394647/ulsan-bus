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
  /**
   * 종점 이름 = 사실상 "○○ 방면".
   * 같은 번호가 양방향으로 지나는 정류장에서 어느 쪽인지 알려준다.
   */
  destination?: string
}

export interface ArrivalsResponse {
  stop: Stop
  arrivals?: Arrival[]
  fetchedAt?: string
  /** DB의 기존 관측을 재사용했는지. true면 최대 45초 뒤처진 값이다. */
  fromCache?: boolean
  error?: string
}

/** 정류장을 지나는 노선. 기점·종점이 있어 방면을 알 수 있다. */
export interface StopRoute {
  routeId: string
  routeNo: string
  routeType?: string
  /** 기점 */
  start?: string
  /** 종점 — 사실상 "○○ 방면" */
  end?: string
}
