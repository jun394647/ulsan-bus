'use client'

import { useFavorites } from '@/lib/favorites'
import type { Stop } from '@/lib/models'

export function FavoriteButton({ stop }: { stop: Stop }) {
  const { toggle, isFavorite } = useFavorites()
  const active = isFavorite(stop.nodeid)

  return (
    <button
      onClick={() => toggle(stop)}
      aria-pressed={active}
      aria-label={active ? '즐겨찾기 해제' : '즐겨찾기 추가'}
      // 걸어가면서 한 손으로 누른다. 터치 영역을 넉넉히 잡는다.
      className="-m-2 shrink-0 rounded-full p-2 text-2xl leading-none active:bg-[var(--color-surface)]"
    >
      <span className={active ? 'text-amber-400' : 'text-[var(--color-border)]'}>
        {active ? '★' : '☆'}
      </span>
    </button>
  )
}
