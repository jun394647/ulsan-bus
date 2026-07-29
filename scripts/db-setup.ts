/**
 * 스키마 생성과 추적 정류장 등록.
 *
 * 실행: pnpm db:setup                    (스키마 + config/tracked-stops.json 등록)
 *       pnpm db:setup --add 31021,40401  (정류소 번호로 추가 등록)
 *
 * schema.sql은 전부 IF NOT EXISTS, 등록은 UPSERT라 여러 번 돌려도 안전하다.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getSql, closeSql } from '../src/lib/db'
import { allStops } from '../src/lib/stops'

/**
 * 트래픽 한도로 계산한 추적 가능 정류장 수.
 * TAGO 10,000회/일 ÷ (17시간 × 30회/시간[2분 간격]) ≈ 19개
 */
const RECOMMENDED_MAX = 19

async function applySchema() {
  const sql = getSql()
  const schema = await readFile(join(process.cwd(), 'db', 'schema.sql'), 'utf-8')
  await sql.unsafe(schema)
  console.log('✓ 스키마 적용 완료')
}

async function listTracked() {
  const sql = getSql()
  const rows = await sql<
    { node_id: string; name: string; note: string | null; active: boolean }[]
  >`SELECT node_id, name, note, active FROM tracked_stops ORDER BY added_at`

  if (rows.length === 0) {
    console.log('추적 중인 정류장이 없습니다. --add 로 추가하세요.')
    return
  }

  console.log(`추적 중인 정류장 ${rows.length}개 (권장 상한 ${RECOMMENDED_MAX}개):`)
  for (const row of rows) {
    console.log(
      `  ${row.active ? '●' : '○'} ${row.name} (${row.node_id})` +
        (row.note ? ` — ${row.note}` : ''),
    )
  }

  const active = rows.filter((r) => r.active).length
  const dailyCalls = active * 17 * 30
  console.log(
    `\n활성 ${active}개 → 2분 간격 기준 하루 약 ${dailyCalls.toLocaleString()}회 호출 (한도 10,000)`,
  )
  if (dailyCalls > 10_000) {
    console.log('  ⚠ 한도를 넘습니다. 정류장을 줄이거나 폴링 간격을 늘리세요.')
  }
}

async function addStops(input: string) {
  const sql = getSql()
  const wanted = input.split(',').map((s) => s.trim()).filter(Boolean)
  const stops = allStops()

  const rows: { node_id: string; name: string; note: string }[] = []

  for (const token of wanted) {
    // 정류소 번호(31021) 또는 nodeid(USB193031021) 둘 다 받는다.
    const found = stops.find(
      (s) => String(s.nodeno) === token || s.nodeid === token,
    )

    if (!found) {
      console.log(`  ✗ ${token} — 스냅샷에서 찾지 못했습니다.`)
      continue
    }

    rows.push({
      node_id: found.nodeid,
      name: found.name,
      note: `번호 ${found.nodeno}`,
    })
  }

  if (rows.length === 0) {
    console.log('추가할 정류장이 없습니다.')
    return
  }

  await sql`
    INSERT INTO tracked_stops ${sql(rows)}
    ON CONFLICT (node_id) DO UPDATE SET active = true
  `

  for (const row of rows) {
    console.log(`  ✓ ${row.name} (${row.node_id})`)
  }
}

/** config/tracked-stops.json에 적어둔 기본 대상을 등록한다. */
async function addConfiguredStops() {
  const path = join(process.cwd(), 'config', 'tracked-stops.json')

  let config: { stops?: { nodeno: number; note?: string }[] }
  try {
    config = JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    console.log('config/tracked-stops.json이 없어 건너뜁니다.')
    return
  }

  const numbers = (config.stops ?? []).map((s) => String(s.nodeno))
  if (numbers.length === 0) return

  console.log(`\nconfig/tracked-stops.json에서 ${numbers.length}개 등록:`)
  await addStops(numbers.join(','))
}

async function main() {
  const args = process.argv.slice(2)
  const addIndex = args.indexOf('--add')

  await applySchema()

  if (addIndex >= 0) {
    const value = args[addIndex + 1]
    if (!value) {
      console.error('--add 뒤에 정류소 번호를 쉼표로 구분해 넣으세요.')
      process.exit(1)
    }
    await addStops(value)
  } else {
    await addConfiguredStops()
  }

  console.log()
  await listTracked()
  await closeSql()
}

main().catch(async (error) => {
  console.error('\n✗ 실패:', error instanceof Error ? error.message : error)
  await closeSql().catch(() => {})
  process.exit(1)
})
