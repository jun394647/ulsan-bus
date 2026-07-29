import type { ParsedRouteName } from './types'

/**
 * BIS 응답 값을 다루는 순수 함수들.
 * 서버/클라이언트 양쪽에서 쓰이므로 client.ts(서버 전용)와 분리해 둔다.
 */

/**
 * 노선명에서 번호와 방면을 분리한다.
 * ROUTENM/BRTNAME은 "337(무동)" 형태로 오고, 방면이 없는 노선도 있다.
 */
export function parseRouteName(routeName: string): ParsedRouteName {
  const name = String(routeName ?? '').trim()
  const match = name.match(/^([^(]+)\(([^)]*)\)\s*$/)

  if (!match) return { number: name }

  const direction = match[2].trim()
  return {
    number: match[1].trim(),
    ...(direction ? { direction } : {}),
  }
}

/**
 * 차량번호에서 지역 접두어를 떼고 표시용 번호만 남긴다.
 * 예: "울산70자1234" → "70자1234"
 */
export function formatVehicleNo(vehicleNo: string): string {
  const value = String(vehicleNo ?? '').trim()
  // 앞의 한글 지역명(2자 이상)을 제거한다. 숫자로 시작하면 그대로 둔다.
  return value.replace(/^[가-힣]{2,}\s*/, '')
}

/**
 * 시간표 TIME("0630")을 시/분으로 나눈다.
 * 파서 설정 탓에 값이 숫자로 넘어와 앞자리 0이 없어진 경우도 방어한다.
 */
export function parseTimetableTime(time: string): { hour: string; minute: string } {
  const padded = String(time ?? '').padStart(4, '0')
  return { hour: padded.slice(0, 2), minute: padded.slice(2, 4) }
}

/**
 * 지원운행 여부를 표시용 문자열로 만든다.
 * CLASS가 "0"이면 일반 운행이다.
 */
export function formatRouteLabel(routeName: string, classNo: string): string {
  const { number } = parseRouteName(routeName)
  const cls = Number(classNo)
  return cls > 0 ? `${number} (지원 ${cls})` : number
}
