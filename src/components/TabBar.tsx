'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * 하단 탭.
 *
 * 이 앱은 한 손으로, 걸어가면서, 급하게 쓴다. 화면 위쪽 버튼은 엄지가 닿지 않는다.
 * 정류장과 길찾기를 오가는 게 주 동작이라 그 둘만 둔다.
 *
 * iOS 홈 인디케이터에 가리지 않도록 safe-area 만큼 여백을 준다.
 */

const TABS = [
  { href: '/', label: '정류장', icon: '🚏' },
  { href: '/journey', label: '길찾기', icon: '🧭' },
] as const

export function TabBar() {
  const pathname = usePathname()

  return (
    <nav
      className="sticky bottom-0 z-10 border-t border-[var(--color-border)] bg-[var(--background)]/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-lg">
        {TABS.map((tab) => {
          // 정류장 상세(/stop/...)도 '정류장' 탭에 속한다.
          const active =
            tab.href === '/'
              ? pathname === '/' || pathname.startsWith('/stop')
              : pathname.startsWith(tab.href)

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium"
              style={{
                color: active ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              <span className="text-lg leading-none" aria-hidden>
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
