/**
 * 수집한 관측에서 버스 궤적을 재구성하고 예측 오차를 계산한다.
 *
 * 실행: pnpm analyze
 *
 * ── 왜 재구성이 필요한가
 * TAGO 도착정보에는 차량번호가 없다. 그래서 "몇 시에 온 버스가 몇 분 늦었나"를
 * 바로 알 수 없고, 관측 시퀀스에서 개별 차량의 궤적을 추론해야 한다.
 *
 * ── 재구성 규칙
 * 같은 (정류장, 노선)의 관측을 시간순으로 늘어놓으면 arrtime이 계속 줄어든다.
 * 줄어드는 동안은 같은 버스다. 값이 갑자기 커지면 앞 버스가 도착했고 그 뒤 버스가
 * 잡히기 시작한 것이다 — 거기서 궤적을 끊는다.
 *
 * ── 실제 도착 시각 추정
 * 궤적의 마지막 관측(t_last)과 그 다음 폴링(t_next) 사이에 버스가 도착했다.
 * 중간값을 실제 도착 시각으로 보고, 오차 한계는 폴링 간격의 절반이다.
 * 마지막 arrtime을 더하는 방식은 쓰지 않는다 — 그건 검증하려는 예측값 자체라
 * 순환논리가 된다.
 */

import { getSql, closeSql } from '../src/lib/db'

/** 이 값보다 arrtime이 커지면 다른 차량으로 본다. 예측이 흔들리는 정도는 넘어야 한다. */
const NEW_VEHICLE_JUMP_SECONDS = 120

/**
 * 궤적의 마지막 arrtime이 이보다 크면 도착이 아니라 관측이 끊긴 것으로 본다.
 *
 * 느슨하게 잡으면 "아직 5분 남았는데 목록에서 사라진" 경우까지 도착으로 세어
 * 오차가 통째로 음수로 쏠린다. 실제로 도착하는 버스는 arrtime이 0에 가까워진다.
 */
const MAX_TRAILING_ARRTIME = 90

/** 다음 폴링까지 이만큼 넘게 비면 수집 공백이므로 도착 판정에 쓰지 않는다. */
const MAX_GAP_SECONDS = 400

interface Observation {
  node_id: string
  route_id: string
  route_no: string
  arrtime: number
  prev_stops: number
  observed_at: Date
}

interface Trace {
  nodeId: string
  routeNo: string
  observations: Observation[]
  /** 추정 실제 도착 시각 */
  arrivedAt: Date
  /** 도착 시각 추정의 불확실성 [초] */
  uncertainty: number
}

const secondsBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 1000

/** 관측을 (정류장, 노선)별로 나눈 뒤 arrtime 증가 지점에서 끊는다. */
function buildTraces(rows: Observation[]): Trace[] {
  const groups = new Map<string, Observation[]>()

  /*
   * 폴링 시각은 정류장마다 따로 관리해야 한다.
   * 수집기가 정류장을 몇 개씩 나눠 병렬 조회하므로 같은 회차라도 정류장별로
   * observed_at이 몇 초씩 어긋난다. 전체를 한 줄로 세우면 "다음 폴링"이
   * 엉뚱한 정류장의 시각으로 잡혀서, 도착 시각이 실제보다 훨씬 앞당겨진다.
   */
  const pollTimesByStop = new Map<string, Date[]>()

  for (const row of rows) {
    const times = pollTimesByStop.get(row.node_id) ?? []
    if (!times.some((t) => t.getTime() === row.observed_at.getTime())) {
      times.push(row.observed_at)
    }
    pollTimesByStop.set(row.node_id, times)
  }

  for (const times of pollTimesByStop.values()) {
    times.sort((a, b) => a.getTime() - b.getTime())
  }

  for (const row of rows) {
    const key = `${row.node_id}|${row.route_id}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  const traces: Trace[] = []

  for (const observations of groups.values()) {
    observations.sort((a, b) => a.observed_at.getTime() - b.observed_at.getTime())

    let current: Observation[] = []

    const flush = () => {
      if (current.length < 2) {
        current = []
        return
      }

      const last = current[current.length - 1]

      // 아직 한참 남은 상태에서 관측이 끊겼다면 도착한 게 아니다.
      if (last.arrtime > MAX_TRAILING_ARRTIME) {
        current = []
        return
      }

      // 같은 정류장에서 마지막 관측 다음의 폴링 시각을 찾는다.
      // 없다면 수집이 그때 끝난 것이지 버스가 도착한 게 아니다.
      const stopPolls = pollTimesByStop.get(last.node_id) ?? []
      const next = stopPolls.find((t) => t.getTime() > last.observed_at.getTime())
      if (!next) {
        current = []
        return
      }

      const gap = secondsBetween(last.observed_at, next)
      if (gap > MAX_GAP_SECONDS) {
        current = []
        return
      }

      traces.push({
        nodeId: last.node_id,
        routeNo: last.route_no,
        observations: current,
        arrivedAt: new Date(last.observed_at.getTime() + (gap / 2) * 1000),
        uncertainty: gap / 2,
      })
      current = []
    }

    for (const observation of observations) {
      const previous = current[current.length - 1]

      if (previous && observation.arrtime > previous.arrtime + NEW_VEHICLE_JUMP_SECONDS) {
        flush()
      }

      current.push(observation)
    }

    flush()
  }

  return traces
}

async function main() {
  const sql = getSql()

  const rows = await sql<Observation[]>`
    SELECT node_id, route_id, route_no, arrtime, prev_stops, observed_at
    FROM arrival_observations
    ORDER BY observed_at
  `

  if (rows.length === 0) {
    console.log('관측 데이터가 없습니다. pnpm collect 를 먼저 실행하세요.')
    await closeSql()
    return
  }

  const pollTimes = [...new Set(rows.map((r) => r.observed_at.getTime()))]
    .sort((a, b) => a - b)
    .map((t) => new Date(t))

  const span = secondsBetween(pollTimes[0], pollTimes[pollTimes.length - 1])

  console.log(`관측 ${rows.length.toLocaleString()}건, 폴링 ${pollTimes.length}회`)
  console.log(
    `수집 기간 ${(span / 3600).toFixed(1)}시간 ` +
      `(${pollTimes[0].toLocaleString('ko-KR')} ~ ${pollTimes[pollTimes.length - 1].toLocaleString('ko-KR')})`,
  )

  // 폴링 간격이 실제로 얼마나 균일한지. 궤적 추정 정확도가 여기에 달려 있다.
  // 정류장별로 재야 한다 — 전체를 섞으면 병렬 조회 때문에 몇 초짜리 간격이 섞여
  // 실제 주기보다 훨씬 짧게 보인다.
  const intervals: number[] = []
  const timesByStop = new Map<string, number[]>()

  for (const row of rows) {
    const times = timesByStop.get(row.node_id) ?? []
    const t = row.observed_at.getTime()
    if (!times.includes(t)) times.push(t)
    timesByStop.set(row.node_id, times)
  }

  for (const times of timesByStop.values()) {
    times.sort((a, b) => a - b)
    for (let i = 1; i < times.length; i++) {
      intervals.push((times[i] - times[i - 1]) / 1000)
    }
  }
  if (intervals.length > 0) {
    const sorted = [...intervals].sort((a, b) => a - b)
    console.log(
      `폴링 간격 중앙값 ${sorted[Math.floor(sorted.length / 2)].toFixed(0)}초 ` +
        `(최소 ${sorted[0].toFixed(0)} / 최대 ${sorted[sorted.length - 1].toFixed(0)})`,
    )
  }

  const traces = buildTraces(rows)

  console.log(`\n재구성된 궤적: ${traces.length}개`)

  if (traces.length === 0) {
    console.log(
      '\n아직 완결된 궤적이 없습니다. 버스가 도착하는 것을 관측하려면\n' +
        '같은 정류장을 수십 분 이상 연속으로 수집해야 합니다.',
    )
    await closeSql()
    return
  }

  // 각 관측의 예측 오차 = (실제 도착 - 관측 시각) - 그때의 예측값
  // 양수면 예측보다 늦게 온 것이다.
  const errors: { predicted: number; actual: number; error: number }[] = []

  for (const trace of traces) {
    for (const observation of trace.observations) {
      const actual = secondsBetween(observation.observed_at, trace.arrivedAt)
      errors.push({
        predicted: observation.arrtime,
        actual,
        error: actual - observation.arrtime,
      })
    }
  }

  const values = errors.map((e) => e.error).sort((a, b) => a - b)
  const median = values[Math.floor(values.length / 2)]
  const mae = errors.reduce((sum, e) => sum + Math.abs(e.error), 0) / errors.length

  console.log(`예측-실제 쌍: ${errors.length}건`)
  console.log(`\n  평균 절대 오차(MAE): ${mae.toFixed(1)}초`)
  console.log(`  오차 중앙값: ${median.toFixed(1)}초 (양수 = 예측보다 늦게 도착)`)
  console.log(
    `  오차 분포: p10 ${values[Math.floor(values.length * 0.1)].toFixed(0)} / ` +
      `p50 ${median.toFixed(0)} / p90 ${values[Math.floor(values.length * 0.9)].toFixed(0)}초`,
  )

  // 예측 구간별로 나눠 본다. 먼 예측일수록 오차가 클 것으로 예상된다.
  console.log('\n  예측 구간별 오차:')
  const buckets = [
    { label: '~1분', max: 60 },
    { label: '1~3분', max: 180 },
    { label: '3~5분', max: 300 },
    { label: '5~10분', max: 600 },
    { label: '10분~', max: Infinity },
  ]

  let lower = 0
  for (const bucket of buckets) {
    const inBucket = errors.filter((e) => e.predicted > lower && e.predicted <= bucket.max)
    lower = bucket.max

    if (inBucket.length === 0) continue

    const bucketMae =
      inBucket.reduce((sum, e) => sum + Math.abs(e.error), 0) / inBucket.length
    const bias = inBucket.reduce((sum, e) => sum + e.error, 0) / inBucket.length

    console.log(
      `    ${bucket.label.padEnd(6)} ${String(inBucket.length).padStart(5)}건  ` +
        `MAE ${bucketMae.toFixed(0).padStart(4)}초  편향 ${bias > 0 ? '+' : ''}${bias.toFixed(0)}초`,
    )
  }

  console.log(
    '\n  ※ 편향이 특정 구간에서 일관되게 한쪽으로 쏠린다면 보정할 여지가 있다는 뜻이다.',
  )
  console.log('    3단계는 이 편향을 정류장·노선·시간대별로 쪼개서 뺀다.')

  await closeSql()
}

main().catch(async (error) => {
  console.error('\n✗ 분석 실패:', error instanceof Error ? error.message : error)
  await closeSql().catch(() => {})
  process.exit(1)
})
