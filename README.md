# 울산버스

울산 버스 도착 정보 웹앱. 내 위치에서 가까운 정류장과 도착 예정 시간을 보여준다.

기존 지도 앱들은 API가 주는 도착예정시간을 그대로 표시한다. 이 프로젝트는 **예측값과 실제 도착 시각의 차이를 계속 기록해서, 그 편향을 빼고 보여주는 것**을 목표로 한다.

## 데이터 출처

| 용도 | API | 일일 한도 |
|---|---|---|
| 정류소 목록·좌표, 도착정보 | [(TAGO) 버스정류소정보](https://www.data.go.kr/data/15098534/openapi.do) / [버스도착정보](https://www.data.go.kr/data/15098530/openapi.do) | 10,000 |
| 시간표, 노선 내 정류장 순번 | [울산광역시 BIS 정보](https://www.data.go.kr/data/15052669/openapi.do) | 1,000 |

주 데이터는 TAGO를 쓴다. 울산 BIS에는 정류장 좌표가 없고 한도도 10배 빠듯하다.
BIS는 TAGO에 없는 시간표와 `BRSSEQNO`(방면 역산용)를 위해 남겨둔다.

공공데이터포털 일반 인증키는 계정당 하나이며 승인된 모든 API에 공통으로 쓰인다.

## 설정

```bash
pnpm install
cp .env.example .env.local   # DATA_GO_KR_KEY, DATABASE_URL 채우기

pnpm build:stops             # 정류소 스냅샷 생성 (data/stops.json)
pnpm dev
```

정류소 스냅샷은 커밋되어 있어서 바로 개발할 수 있다. 정류소가 신설·폐지되면 다시 만든다.

## 로그 수집

```bash
pnpm db:setup     # 스키마 + config/tracked-stops.json 등록
pnpm collect      # 1회 수집
pnpm analyze      # 궤적 재구성 및 예측 오차 분석
```

정기 수집은 GitHub Actions(`.github/workflows/collect.yml`)가 담당한다.
cron 최소 간격이 5분이라, 워크플로 하나가 몇 시간 살아 있으면서 그 안에서 2분마다 돈다.

수집 대상은 `config/tracked-stops.json`에서 관리한다.
정류장 1개당 하루 약 510회(2분 간격, 17시간)를 쓰므로 한도 기준 19개가 상한이다.

## 검증 스크립트

```bash
pnpm verify:tago  # TAGO 스펙, 좌표 유효성, BIS와의 정류장 매칭률
pnpm verify:bis   # 울산 BIS 스펙, ARRIVALTIME 단위, 방면 역산 가능성
```

## 알아둘 것

- **TAGO 도착정보에는 차량번호가 없다.** 개별 버스를 추적할 수 없어서, 궤적은
  `arrtime`이 단조 감소하는 연속 관측을 이어 붙여 재구성한다 (`scripts/analyze.ts`).
- **TAGO는 동시 세션이 차면 `[99]`를 반환한다.** 일시적이므로 재시도한다.
- **울산 BIS는 https가 아니라 http만 동작한다.** 포털 문서와 다르다.
- **응답이 느리다** (실측 4~13초). 타임아웃을 30초로 잡았다.
- **울산 정류소의 47%가 동명이다.** 이름만으로는 특정할 수 없어 번호와 거리를 함께 보여준다.
