/**
 * 울산광역시 BIS 정보 OpenAPI 응답 타입.
 * https://www.data.go.kr/data/15052669/openapi.do
 *
 * 모든 필드를 string으로 받는다. XML 파서가 숫자로 변환하면
 * BusTimetable의 TIME("0630")에서 앞자리 0이 날아가는 등의 손실이 생긴다.
 * 숫자가 필요한 곳에서만 명시적으로 변환한다.
 */

/** BusStopInfo.xo — 전체 정류장 목록 */
export interface StopRow {
  STOPID: string
  STOPNAME: string
  /** 정류장 부가 설명. 방면·위치 힌트가 들어있어 동명 정류장 구분에 쓴다. */
  STOPREMARK: string
}

/** RouteInfo.xo — 전체 노선 목록 */
export interface RouteRow {
  /** 노선번호 (표시용). 예: "337" */
  BRTNO: string
  /** 노선 ID. 다른 오퍼레이션의 Routeid/ROUTEID와 같은 체계. */
  BRTID: string
  /** 방면이 괄호로 붙는다. 예: "337(무동)" */
  BRTNAME: string
  /** 지원운행 구분. 0이 아니면 지원 차수. */
  CLASS: string
  /** 방향 코드 */
  DIRECTION: string
}

/** AllRouteDetailInfo.xo — 노선의 경유 정류장 (Routeid 필요) */
export interface RouteDetailRow {
  ROUTEID: string
  /** 노선 내 정류장 순번. 방면 역산의 핵심 필드. */
  BRSSEQNO: string
  STOPID: string
  STOPNM: string
}

/** getBusArrivalInfo.xo — 정류장 도착 예정 버스 (stopid 필요) */
export interface ArrivalRow {
  /** 지역 접두어가 붙어있다. 표시할 때는 뒷자리만 쓴다. */
  VEHICLENO: string
  /** 조회 정류장까지 남은 정류장 수 */
  PREVSTOPCNT: string
  /** 도착예정시간. 단위(초/분)는 0단계에서 실측 확인이 필요하다. */
  ARRIVALTIME: string
  ROUTEID: string
  /** 버스가 현재 위치한 정류장 '이름'. ID가 아니라서 동명 정류장 주의. */
  PRESENTSTOPNM: string
  /** 방면이 괄호로 붙는다. 예: "337(무동)" */
  ROUTENM: string
}

/** BusTimetable.xo — 노선 시간표 (routeNo, dayOfWeek 필요) */
export interface TimetableRow {
  DIRECTION: string
  /** "0630" 형태 4자리. 파서가 숫자로 만들면 "630"이 되므로 string 유지. */
  TIME: string
  CLASS: string
}

/** 노선명에서 분리한 번호와 방면 */
export interface ParsedRouteName {
  /** 예: "337" */
  number: string
  /** 예: "무동". 괄호 표기가 없으면 undefined. */
  direction?: string
}
