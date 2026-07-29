import Link from 'next/link'
import { JourneyPlanner } from '@/components/JourneyPlanner'

export const metadata = {
  title: '길찾기 · 울산버스',
}

export default function JourneyPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <header className="px-4 pt-4 pb-4">
        <Link href="/" className="inline-block py-1 text-sm text-[var(--color-muted)]">
          ← 정류장
        </Link>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight">길찾기</h1>
      </header>

      <JourneyPlanner />
    </main>
  )
}
