/**
 * 전체 정류소의 경유노선을 미리 받아 DB에 채운다.
 *
 * 실행: pnpm warm:routes
 *       pnpm warm:routes --limit 500    (일부만)
 *
 * ── 왜 필요한가
 * 길찾기는 출발 후보 4곳 + 도착 후보 3곳의 경유노선을 한꺼번에 본다.
 * 캐시에 없으면 TAGO를 7번 부르는데, 간헐적 지연이 겹쳐 첫 조회가 10~21초까지 걸린다.
 * 미리 채워두면 길찾기가 DB만 읽어 1초 안에 끝난다.
 *
 * ── 트래픽
 * 정류소 3,615곳 × 1회 = 약 3,615회. 일일 한도 10,000 안에 들어간다.
 * 이미 채워진 정류소는 건너뛰므로 중단 후 다시 실행해도 낭비가 없다.
 */

import { allStops } from '../src/lib/stops'
import { getStopRoutes } from '../src/lib/routes'
import { getSql, closeSql } from '../src/lib/db'
import { getCallCount } from '../src/lib/tago/client'

/**
 * 동시 요청 수.
 * TAGO는 동시 세션이 차면 [99]를 반환한다. 재시도가 있지만 그만큼 느려지므로
 * 낮게 유지하는 편이 전체적으로 빠르다.
 */
const CONCURRENCY = 4

/** 한도를 넘지 않도록 안전선을 둔다. 도착정보 수집도 같은 키를 쓴다. */
const MAX_CALLS = 6000

async function main() {
  const limitArg = process.argv.indexOf('--limit')
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity

  const sql = getSql()

  // 이미 받아둔 정류소는 건너뛴다.
  const existing = await sql<{ node_id: string }[]>`
    SELECT DISTINCT node_id FROM stop_routes
  `
  const done = new Set(existing.map((r) => r.node_id))

  const targets = allStops()
    .filter((stop) => !done.has(stop.nodeid))
    .slice(0, Number.isFinite(limit) ? limit : undefined)

  console.log(`전체 ${allStops().length}곳 / 이미 완료 ${done.size}곳`)
  console.log(`이번에 받을 정류소: ${targets.length}곳 (동시 ${CONCURRENCY})`)

  if (targets.length === 0) {
    console.log('\n모두 채워져 있습니다.')
    await closeSql()
    return
  }

  const started = Date.now()
  let ok = 0
  let empty = 0
  let failed = 0

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    if (getCallCount() >= MAX_CALLS) {
      console.log(`\n⚠ 호출 상한 ${MAX_CALLS}회에 도달해 중단합니다.`)
      console.log('  나중에 다시 실행하면 남은 정류소부터 이어갑니다.')
      break
    }

    const batch = targets.slice(i, i + CONCURRENCY)

    await Promise.all(
      batch.map(async (stop) => {
        try {
          const routes = await getStopRoutes(stop.nodeid)
          if (routes.length === 0) empty++
          else ok++
        } catch {
          failed++
        }
      }),
    )

    // 진행 상황을 주기적으로 알린다. 오래 걸리는 작업이라 침묵하면 멈춘 줄 안다.
    const processed = Math.min(i + CONCURRENCY, targets.length)
    if (processed % 200 < CONCURRENCY || processed === targets.length) {
      const elapsed = (Date.now() - started) / 1000
      const rate = processed / elapsed
      const remaining = (targets.length - processed) / rate
      console.log(
        `  ${processed}/${targets.length} ` +
          `(성공 ${ok} / 노선없음 ${empty} / 실패 ${failed}) ` +
          `${elapsed.toFixed(0)}초 경과, 약 ${Math.ceil(remaining / 60)}분 남음`,
      )
    }
  }

  const [count] = await sql<{ n: number; stops: number }[]>`
    SELECT count(*)::int n, count(DISTINCT node_id)::int stops FROM stop_routes
  `

  console.log(
    `\n✓ 완료. DB에 정류소 ${count.stops}곳, 노선 연결 ${count.n.toLocaleString()}건`,
  )
  console.log(`  API 호출 ${getCallCount()}회, ${((Date.now() - started) / 60000).toFixed(1)}분 소요`)

  await closeSql()
}

main().catch(async (error) => {
  console.error('\n✗ 실패:', error instanceof Error ? error.message : error)
  await closeSql().catch(() => {})
  process.exit(1)
})
