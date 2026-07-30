import { NearbyStops } from '@/components/NearbyStops'

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      {/* 검색창이 화면 위에 고정되어 스크롤 중에도 바로 쓸 수 있다. */}
      <header className="sticky top-0 z-10 bg-[var(--background)]/95 px-4 pt-5 pb-2 backdrop-blur">
        <h1 className="text-2xl font-bold tracking-tight">울산버스</h1>
      </header>

      <NearbyStops />
    </main>
  )
}
