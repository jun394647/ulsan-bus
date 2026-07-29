import postgres from 'postgres'

/**
 * Postgres 연결.
 *
 * postgres.js를 쓰는 이유: connection string만 있으면 Neon·Supabase·로컬 어디든
 * 붙는다. 특정 벤더의 드라이버에 묶이지 않는다.
 *
 * ⚠ 연결은 첫 사용 시점에 만든다. 모듈 최상위에서 만들면 DATABASE_URL이 없는 환경
 *   (빌드 타임의 라우트 수집 등)에서 import만으로 터진다.
 */

type Sql = ReturnType<typeof postgres>

declare global {
  // 개발 중 HMR이 모듈을 다시 평가할 때마다 연결이 새로 생기는 것을 막는다.
  var __sql: Sql | undefined
}

function create(): Sql {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL 환경변수가 없습니다. .env.example을 참고해 설정하세요.',
    )
  }

  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    // Neon 등 관리형 Postgres는 TLS를 요구한다. 로컬은 sslmode=disable로 끈다.
    ssl: url.includes('sslmode=disable') ? false : 'require',
  })
}

export function getSql(): Sql {
  if (!globalThis.__sql) {
    globalThis.__sql = create()
  }
  return globalThis.__sql
}

/** 연결을 만든 적이 없으면 아무것도 하지 않는다. */
export async function closeSql() {
  if (globalThis.__sql) {
    await globalThis.__sql.end()
    globalThis.__sql = undefined
  }
}
