/**
 * 국토교통부 TAGO(국가대중교통정보센터) OpenAPI 응답 타입.
 *
 * - 버스정류소정보: https://www.data.go.kr/data/15098534/openapi.do
 * - 버스도착정보:   https://www.data.go.kr/data/15098530/openapi.do
 *
 * 울산 BIS와 달리 JSON(_type=json)을 지원하고 일일 한도가 10,000회로 10배 넉넉하다.
 * 정류소 좌표도 여기서만 얻을 수 있다.
 *
 * 숫자 필드가 실제로 number로 오는지 string으로 오는지는 응답마다 편차가 있어
 * 양쪽을 모두 받고 필요한 곳에서 변환한다.
 */

type Numeric = number | string

/** getCtyCodeList — 도시코드 목록 */
export interface CityCode {
  citycode: Numeric
  cityname: string
}

/** getSttnNoList / getCrdntPrxmtSttnList — 정류소 */
export interface TagoStop {
  /** TAGO 정류소 ID. 예: "ULB..." 형태. 울산 BIS의 STOPID와 체계가 다를 수 있다. */
  nodeid: string
  nodenm: string
  /** 정류소 번호(시민이 보는 5자리 번호). BIS STOPID와 매칭할 때 이쪽이 더 유망하다. */
  nodeno?: Numeric
  /** WGS84 위도 */
  gpslati: Numeric
  /** WGS84 경도 */
  gpslong: Numeric
  citycode?: Numeric
}

/** getSttnAcctoArvlPrearngeInfoList — 정류소별 도착예정 */
export interface TagoArrival {
  nodeid: string
  nodenm: string
  routeid: string
  /** 노선번호. 예: "337" */
  routeno: Numeric
  /** 노선 유형. 예: "일반버스" */
  routetp?: string
  /** 도착예상시간 [초]. 문서에 단위가 명시되어 있다. */
  arrtime: Numeric
  /** 남은 정류장 수 */
  arrprevstationcnt: Numeric
  /** 차량 유형(저상 여부 등) */
  vehicletp?: string
}

/** 공공데이터포털 표준 JSON 응답 봉투 */
export interface TagoEnvelope<T> {
  response?: {
    header?: {
      resultCode?: string
      resultMsg?: string
    }
    body?: {
      items?: '' | { item?: T | T[] }
      numOfRows?: Numeric
      pageNo?: Numeric
      totalCount?: Numeric
    }
  }
}
