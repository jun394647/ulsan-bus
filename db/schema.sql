-- 2단계: 도착 예측 로그 수집 스키마
--
-- 설계 원칙: 관측 원본을 그대로 쌓는다.
-- 도착 판정 로직은 데이터를 보고 나서야 제대로 만들 수 있고, 여러 번 고치게 된다.
-- 원본이 남아 있으면 판정 방식을 바꿔가며 과거 데이터를 다시 분석할 수 있다.
-- 판정 결과만 저장하면 그 기회를 잃는다.

-- 폴링 대상 정류장.
-- 트래픽 한도(TAGO 10,000회/일) 때문에 전체를 볼 수 없다.
-- 운행시간 17시간 동안 2분 간격이면 정류장 1개당 하루 510회 → 약 19개가 상한이다.
CREATE TABLE IF NOT EXISTS tracked_stops (
  node_id     text PRIMARY KEY,
  name        text NOT NULL,
  -- 왜 이 정류장을 추적하는지. 나중에 대상을 조정할 때 판단 근거가 된다.
  note        text,
  active      boolean NOT NULL DEFAULT true,
  added_at    timestamptz NOT NULL DEFAULT now()
);

-- 폴링 원본. 한 번 조회할 때마다 나온 노선별 예측을 그대로 한 행씩 남긴다.
CREATE TABLE IF NOT EXISTS arrival_observations (
  id            bigserial PRIMARY KEY,
  node_id       text NOT NULL,
  route_id      text NOT NULL,
  route_no      text NOT NULL,
  -- API가 알려준 도착까지 남은 시간 [초]. 이 값의 오차를 재는 것이 프로젝트의 목표다.
  arrtime       integer NOT NULL,
  -- 남은 정류장 수. 차량번호가 없는 상황에서 궤적을 잇는 보조 신호로 쓴다.
  prev_stops    integer NOT NULL,
  -- 수집 시각. 실제 도착 시각 추정의 기준점이라 정확해야 한다.
  observed_at   timestamptz NOT NULL DEFAULT now()
);

-- 저상버스 여부. 화면에 표시하는 정보라, 캐시된 관측을 그대로 보여주려면 함께 남겨야 한다.
ALTER TABLE arrival_observations ADD COLUMN IF NOT EXISTS vehicle_type text;

-- 궤적 재구성과 잔차 집계가 모두 (정류장, 노선, 시간) 순으로 훑는다.
CREATE INDEX IF NOT EXISTS idx_observations_trace
  ON arrival_observations (node_id, route_id, observed_at);

-- 캐시 조회는 "이 정류장의 가장 최근 관측"을 찾는다.
CREATE INDEX IF NOT EXISTS idx_observations_latest
  ON arrival_observations (node_id, observed_at DESC);

-- 최근 수집 상태를 빠르게 보기 위한 인덱스.
CREATE INDEX IF NOT EXISTS idx_observations_observed_at
  ON arrival_observations (observed_at DESC);

-- 수집 실행 기록. 크론이 실제로 돌고 있는지, 몇 건을 썼는지 확인용.
-- API 호출량이 한도에 걸리는지 여기서 본다.
CREATE TABLE IF NOT EXISTS collection_runs (
  id              bigserial PRIMARY KEY,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  stops_polled    integer NOT NULL DEFAULT 0,
  observations    integer NOT NULL DEFAULT 0,
  api_calls       integer NOT NULL DEFAULT 0,
  errors          integer NOT NULL DEFAULT 0,
  error_detail    text
);
