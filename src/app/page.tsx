import Link from 'next/link'
import { NearbyStops } from '@/components/NearbyStops'

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <header className="flex items-center justify-between px-4 pt-6 pb-3">
        <h1 className="text-2xl font-bold tracking-tight">울산버스</h1>
        <Link
          href="/journey"
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-semibold active:bg-[var(--color-surface-strong)]"
        >
          길찾기
        </Link>
      </header>

      <NearbyStops />
    </main>
  )
}
