import { XMLParser } from 'fast-xml-parser'
import type {
  ArrivalRow,
  RouteDetailRow,
  RouteRow,
  StopRow,
  TimetableRow,
} from './types'

/**
 * 포털 문서에는 https로 적혀 있지만 실제 서버는 443 포트를 열어두지 않았다
 * (ECONNREFUSED). http만 동작한다.
 */
const BASE_URL = 'http://openapi.its.ulsan.kr/UlsanAPI'

/** 전체 목록을 한 번에 받기 위한 값. API가 페이지네이션을 강제하지 않는다. */
const BULK_ROWS = 10000

/** 공공데이터포털 응답이 느리다. TAGO 실측이 4~13초였다. */
const DEFAULT_TIMEOUT_MS = 30000
const MAX_ATTEMPTS = 3

/**
 * 모든 값을 문자열로 받는다. TIME("0630")의 앞자리 0 유실을 비롯해
 * 숫자 변환이 득보다 실이 큰 필드가 많다. types.ts 주석 참조.
 */
const parser = new XMLParser({
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  ignoreAttributes: true,
})

export class BisError extends Error {
  constructor(
    message: string,
    readonly operation: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'BisError'
  }
}

/**
 * 일일 트래픽 한도(개발계정 1,000회)가 빡빡해서 호출량을 눈으로 볼 수 있어야 한다.
 * 서버리스에서는 인스턴스마다 리셋되므로 정확한 총계가 아니라 개발 중 참고용이다.
 * 정확한 집계가 필요해지면 2단계의 Postgres에 기록한다.
 */
let callCount = 0
export const getCallCount = () => callCount

/**
 * data.go.kr 일반 인증키는 계정당 하나로 모든 승인 API에 공통이다.
 * DATA_GO_KR_KEY 하나면 되고, 따로 쓰고 싶을 때만 ULSAN_BIS_KEY로 덮어쓴다.
 */
function getServiceKey(): string {
  const key = process.env.ULSAN_BIS_KEY || process.env.DATA_GO_KR_KEY
  if (!key) {
    throw new Error(
      'ULSAN_BIS_KEY 또는 DATA_GO_KR_KEY 환경변수가 없습니다. .env.example을 참고해 .env.local에 설정하세요.',
    )
  }
  return key
}

/**
 * 공공데이터포털은 인증 실패 등을 HTTP 200 + 다른 XML 구조로 돌려준다.
 * 정상 응답은 tableInfo.list.row, 에러는 OpenAPI_ServiceResponse.cmmMsgHeader.
 */
interface BisEnvelope {
  tableInfo?: {
    list?: { row?: unknown }
  }
  /**
   * 오류 응답 구조는 두 가지가 관측된다.
   *  - <Response><error><resultCode>30</resultCode>...  (미승인 키 등)
   *  - <OpenAPI_ServiceResponse><cmmMsgHeader>...       (포털 공통 오류)
   * 둘 다 HTTP 200으로 오므로 상태 코드만 봐서는 알 수 없다.
   */
  Response?: {
    error?: {
      resultCode?: string
      resultMsg?: string
    }
  }
  OpenAPI_ServiceResponse?: {
    cmmMsgHeader?: {
      returnAuthMsg?: string
      errMsg?: string
    }
  }
}

function extractRows(parsed: unknown, operation: string): unknown[] {
  const root = parsed as BisEnvelope

  const responseError = root?.Response?.error
  if (responseError) {
    throw new BisError(
      `API가 오류를 반환했습니다: [${responseError.resultCode}] ${responseError.resultMsg ?? ''}`,
      operation,
    )
  }

  const errorHeader = root?.OpenAPI_ServiceResponse?.cmmMsgHeader
  if (errorHeader) {
    const msg =
      errorHeader.returnAuthMsg ??
      errorHeader.errMsg ??
      JSON.stringify(errorHeader)
    throw new BisError(`API가 오류를 반환했습니다: ${msg}`, operation)
  }

  const tableInfo = root?.tableInfo
  if (!tableInfo) {
    throw new BisError(
      `예상과 다른 응답 구조입니다: ${JSON.stringify(parsed).slice(0, 300)}`,
      operation,
    )
  }

  const rows = tableInfo.list?.row

  // 결과가 없으면 list가 비어있거나 아예 없다.
  if (rows === undefined || rows === null || rows === '') return []

  // 행이 하나면 배열이 아니라 객체로 온다.
  return Array.isArray(rows) ? rows : [rows]
}

interface CallOptions {
  /** Next.js fetch 캐시 유지 시간(초). 미지정 시 캐시하지 않는다. */
  revalidate?: number
  timeoutMs?: number
}

async function call<T>(
  operation: string,
  params: Record<string, string | number> = {},
  options: CallOptions = {},
): Promise<T[]> {
  const query = new URLSearchParams({
    // Decoding 키를 넣으면 URLSearchParams가 인코딩한다.
    // 이미 인코딩된 Encoding 키를 넣으면 이중 인코딩으로 인증에 실패한다.
    serviceKey: getServiceKey(),
    numOfRows: String(BULK_ROWS),
    pageNo: '1',
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ),
  })

  const url = `${BASE_URL}/${operation}?${query}`
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      callCount++
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/xml' },
        ...(options.revalidate !== undefined
          ? { next: { revalidate: options.revalidate } }
          : { cache: 'no-store' as const }),
      })

      if (!response.ok) {
        // 4xx는 재시도해도 결과가 같다.
        if (response.status >= 400 && response.status < 500) {
          throw new BisError(
            `HTTP ${response.status} ${response.statusText}`,
            operation,
          )
        }
        throw new Error(`HTTP ${response.status}`)
      }

      const xml = await response.text()
      return extractRows(parser.parse(xml), operation) as T[]
    } catch (error) {
      lastError = error

      // 응답을 받고 판단한 오류는 재시도 대상이 아니다.
      if (error instanceof BisError) throw error

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)))
      }
    }
  }

  throw new BisError(
    `${MAX_ATTEMPTS}회 시도 후 실패했습니다.`,
    operation,
    lastError,
  )
}

/**
 * 정류장·노선 목록은 거의 바뀌지 않는다. 트래픽 한도를 아끼려고 길게 캐시한다.
 * 실제 갱신 주기는 0단계에서 확인한다.
 */
const STATIC_REVALIDATE = 60 * 60 * 24

export const bis = {
  /** 울산 전체 정류장 */
  allStops: () =>
    call<StopRow>('BusStopInfo.xo', {}, { revalidate: STATIC_REVALIDATE }),

  /** 울산 전체 노선 */
  allRoutes: () =>
    call<RouteRow>('RouteInfo.xo', {}, { revalidate: STATIC_REVALIDATE }),

  /** 노선의 경유 정류장 (순번 포함) */
  routeDetail: (routeId: string) =>
    call<RouteDetailRow>(
      'AllRouteDetailInfo.xo',
      { Routeid: routeId },
      { revalidate: STATIC_REVALIDATE },
    ),

  /**
   * 정류장 도착 예정 버스. 실시간이므로 짧게만 캐시한다.
   * 30초는 트래픽 한도와 체감 신선도의 절충값이다.
   */
  arrivals: (stopId: string) =>
    call<ArrivalRow>('getBusArrivalInfo.xo', { stopid: stopId }, { revalidate: 30 }),

  /** 노선 시간표. dayOfWeek 코드 체계는 0단계에서 확인한다. */
  timetable: (routeNo: string, dayOfWeek: string) =>
    call<TimetableRow>(
      'BusTimetable.xo',
      { routeNo, dayOfWeek },
      { revalidate: STATIC_REVALIDATE },
    ),
}
