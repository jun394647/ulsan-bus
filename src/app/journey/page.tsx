import { JourneyPlanner } from '@/components/JourneyPlanner'

export const metadata = {
  title: '길찾기 · 울산버스',
}

export default function JourneyPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <header className="sticky top-0 z-10 bg-[var(--background)]/95 px-4 pt-5 pb-3 backdrop-blur">
        <h1 className="text-2xl font-bold tracking-tight">길찾기</h1>
      </header>

      <JourneyPlanner />
    </main>
  )
}
