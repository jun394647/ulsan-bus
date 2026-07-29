/**
 * 노선번호 배지.
 *
 * 울산 버스는 routetp로 종류를 구분한다(일반버스·좌석버스 등).
 * 요금과 정차 패턴이 다르므로 번호만으로는 부족하고, 색으로 즉시 구분되게 한다.
 */

const TYPE_COLORS: Record<string, string> = {
  일반버스: 'var(--route-normal)',
  좌석버스: 'var(--route-seat)',
  급행버스: 'var(--route-express)',
  직행좌석버스: 'var(--route-express)',
  마을버스: 'var(--route-village)',
  지선버스: 'var(--route-normal)',
}

function colorFor(routeType?: string): string {
  if (!routeType) return 'var(--route-normal)'
  return TYPE_COLORS[routeType] ?? 'var(--route-normal)'
}

export function RouteBadge({
  routeNo,
  routeType,
  size = 'md',
}: {
  routeNo: string
  routeType?: string
  size?: 'md' | 'lg'
}) {
  return (
    <span
      className={`tabular font-bold ${size === 'lg' ? 'text-xl' : 'text-lg'}`}
      style={{ color: colorFor(routeType) }}
    >
      {routeNo}
    </span>
  )
}

/** 좌석버스처럼 요금이 다른 노선만 라벨을 붙인다. 일반버스는 기본값이라 생략한다. */
export function RouteTypeLabel({ routeType }: { routeType?: string }) {
  if (!routeType || routeType === '일반버스') return null

  return (
    <span
      className="rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        color: colorFor(routeType),
        backgroundColor: 'var(--color-surface-strong)',
      }}
    >
      {routeType.replace('버스', '')}
    </span>
  )
}
