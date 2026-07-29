/**
 * 수집을 한 번 실행한다. 크론을 붙이기 전에 동작을 확인하거나,
 * 외부 스케줄러(GitHub Actions, launchd 등)에서 직접 호출할 때 쓴다.
 *
 * 실행: pnpm collect
 */

import { collect } from '../src/lib/collector'
import { getSql, closeSql } from '../src/lib/db'

async function main() {
  const started = Date.now()
  const result = await collect()

  console.log(
    `정류장 ${result.stopsPolled}개 → 관측 ${result.observations}건, ` +
      `API ${result.apiCalls}회, 오류 ${result.errors}건 (${Date.now() - started}ms)`,
  )

  if (result.errors > 0) {
    const [row] = await getSql()<{ error_detail: string | null }[]>`
      SELECT error_detail FROM collection_runs WHERE id = ${result.runId}
    `
    if (row?.error_detail) console.error('오류 내용:\n' + row.error_detail)
  }

  await closeSql()
}

main().catch(async (error) => {
  console.error('✗ 수집 실패:', error instanceof Error ? error.message : error)
  await closeSql().catch(() => {})
  process.exit(1)
})
