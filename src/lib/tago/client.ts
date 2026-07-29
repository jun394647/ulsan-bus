import type {
  CityCode,
  TagoArrival,
  TagoEnvelope,
  TagoStop,
} from './types'

/**
 * TAGO OpenAPI 클라이언트.
 *
 * 울산 BIS 클라이언트와 달리 JSON을 쓴다(_type=json). XML 파싱과
 * 필드별 형변환 함정이 없어 훨씬 단순하다.
 */

const STOP_INFO_BASE = 'https://apis.data.go.kr/1613000/BusSttnInfoInqireService'
const ARRIVAL_BASE = 'https://apis.data.go.kr/1613000/ArvlInfoInqireService'

/**
 * 공공데이터포털 응답이 느리다. 실측으로 정류소 100건에 4초, 10건에 13초까지 나왔다
 * (건수보다 서버 상태에 좌우된다). 8초로는 정상 응답도 끊긴다.
 */
const DEFAULT_TIMEOUT_MS = 30000
const MAX_ATTEMPTS = 3
const BULK_ROWS = 1000

export class TagoError extends Error {
  constructor(
    message: string,
    readonly operation: string,
    readonly cause?: unknown,
    /** 잠시 후 다시 부르면 성공할 수 있는 오류인지 */
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'TagoError'
  }
}

/**
 * 다시 시도할 가치가 있는 resultCode.
 *
 *  99 — "가용한 세션이 존재하지 않습니다 (30/30)". 동시 접속 한도로,
 *       실제 운영 중 자주 나온다. 재시도하면 대개 통과한다.
 *  01~04 — 제공기관 시스템 오류.
 *
 * 반대로 30(미등록 키), 31(기한만료), 20(접근거부), 22(요청 한도 초과)는
 * 다시 불러도 결과가 같으므로 즉시 실패시킨다.
 */
const RETRYABLE_RESULT_CODES = new Set(['99', '01', '02', '03', '04'])

let callCount = 0
export const getCallCount = () => callCount

/**
 * data.go.kr의 일반 인증키는 계정당 하나이고 승인된 모든 API에 공통으로 쓰인다.
 * 그래서 DATA_GO_KR_KEY 하나면 충분하지만, 키를 따로 관리하고 싶은 경우를 위해
 * TAGO_KEY로 덮어쓸 수 있게 해 둔다.
 */
function getServiceKey(): string {
  const key = process.env.TAGO_KEY || process.env.DATA_GO_KR_KEY
  if (!key) {
    throw new Error(
      'TAGO_KEY 또는 DATA_GO_KR_KEY 환경변수가 없습니다. .env.example을 참고하세요.',
    )
  }
  return key
}

/**
 * 공공데이터포털 표준 봉투에서 항목 배열을 꺼낸다.
 *
 * 함정 세 가지:
 *  - 인증 실패 등은 JSON이 아니라 XML로 온다.
 *  - 결과가 없으면 items가 빈 문자열("")이다.
 *  - 항목이 하나면 item이 배열이 아니라 객체다.
 */
function extractItems<T>(raw: string, operation: string): T[] {
  let parsed: TagoEnvelope<T>

  try {
    parsed = JSON.parse(raw)
  } catch {
    // 인증 오류는 XML로 돌아온다. 메시지를 뽑아 알려준다.
    const authMsg = raw.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/)?.[1]
    const errMsg = raw.match(/<errMsg>(.*?)<\/errMsg>/)?.[1]
    if (authMsg || errMsg) {
      throw new TagoError(
        `API가 오류를 반환했습니다: ${[errMsg, authMsg].filter(Boolean).join(' / ')}`,
        operation,
      )
    }
    throw new TagoError(
      `JSON 파싱 실패: ${raw.slice(0, 300)}`,
      operation,
    )
  }

  const header = parsed.response?.header
  if (header?.resultCode && header.resultCode !== '00') {
    const code = String(header.resultCode)
    throw new TagoError(
      `API가 오류를 반환했습니다: [${code}] ${header.resultMsg ?? ''}`,
      operation,
      undefined,
      RETRYABLE_RESULT_CODES.has(code),
    )
  }

  // 결과가 없으면 items가 빈 문자열("")로 온다. falsy 검사로 함께 걸러진다.
  const items = parsed.response?.body?.items
  if (!items) return []

  const item = items.item
  if (item === undefined || item === null) return []

  return Array.isArray(item) ? item : [item]
}

interface CallOptions {
  revalidate?: number
  timeoutMs?: number
}

async function call<T>(
  baseUrl: string,
  operation: string,
  params: Record<string, string | number> = {},
  options: CallOptions = {},
): Promise<T[]> {
  const query = new URLSearchParams({
    serviceKey: getServiceKey(),
    _type: 'json',
    numOfRows: String(BULK_ROWS),
    pageNo: '1',
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ),
  })

  const url = `${baseUrl}/${operation}?${query}`
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      callCount++
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
        ...(options.revalidate !== undefined
          ? { next: { revalidate: options.revalidate } }
          : { cache: 'no-store' as const }),
      })

      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          throw new TagoError(
            `HTTP ${response.status} ${response.statusText}`,
            operation,
          )
        }
        throw new Error(`HTTP ${response.status}`)
      }

      return extractItems<T>(await response.text(), operation)
    } catch (error) {
      lastError = error

      // 재시도해도 결과가 같은 오류는 즉시 올린다.
      if (error instanceof TagoError && !error.retryable) throw error

      if (attempt < MAX_ATTEMPTS) {
        // 동시 세션 초과(99)는 다른 요청이 끝나기를 기다려야 하므로
        // 네트워크 오류보다 넉넉히 쉰다.
        const base = error instanceof TagoError ? 1500 : 300
        await new Promise((resolve) => setTimeout(resolve, base * 2 ** (attempt - 1)))
      }
    }
  }

  if (lastError instanceof TagoError) throw lastError
  throw new TagoError(`${MAX_ATTEMPTS}회 시도 후 실패했습니다.`, operation, lastError)
}

const STATIC_REVALIDATE = 60 * 60 * 24

export const tago = {
  /** 도시코드 목록. 울산 코드를 확인할 때 쓴다. */
  cityCodes: () =>
    call<CityCode>(STOP_INFO_BASE, 'getCtyCodeList', {}, { revalidate: STATIC_REVALIDATE }),

  /**
   * 도시의 정류소 목록. 정류소명/번호로 검색한다.
   * 전체를 받으려면 페이지를 넘겨야 할 수 있다(울산은 수천 개 규모).
   */
  stops: (cityCode: string | number, pageNo = 1, numOfRows = BULK_ROWS) =>
    call<TagoStop>(
      STOP_INFO_BASE,
      'getSttnNoList',
      { cityCode, pageNo, numOfRows },
      { revalidate: STATIC_REVALIDATE },
    ),

  /**
   * 좌표 기준 근접 정류소.
   * 서버가 직접 계산해 주므로 1단계 "내 위치 근처" 기능을 이것만으로 구현할 수 있다.
   * 다만 매 요청이 트래픽을 소모하므로, 정류소 스냅샷을 만들어
   * 로컬에서 haversine으로 푸는 쪽이 한도 관리에 유리하다. 0단계에서 결정한다.
   */
  nearbyStops: (lat: number, lng: number) =>
    call<TagoStop>(
      STOP_INFO_BASE,
      'getCrdntPrxmtSttnList',
      { gpsLati: lat, gpsLong: lng },
      { revalidate: 0 },
    ),

  /** 정류소별 도착예정정보. arrtime은 초 단위. */
  arrivals: (cityCode: string | number, nodeId: string) =>
    call<TagoArrival>(
      ARRIVAL_BASE,
      'getSttnAcctoArvlPrearngeInfoList',
      { cityCode, nodeId },
      { revalidate: 30 },
    ),
}
