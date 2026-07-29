import { NearbyStops } from '@/components/NearbyStops'

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <header className="px-4 pt-6 pb-1">
        <h1 className="text-2xl font-bold tracking-tight">울산버스</h1>
      </header>

      <NearbyStops />
    </main>
  )
}
