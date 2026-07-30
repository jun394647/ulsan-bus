import type { MetadataRoute } from 'next'

/**
 * PWA 매니페스트.
 *
 * 버스 앱은 정류장 앞에서 급하게 켠다. 홈 화면 아이콘으로 두면 브라우저를 열고
 * 주소를 찾는 단계가 사라진다. standalone으로 띄워 주소창도 없앤다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '울산버스',
    short_name: '울산버스',
    description: '울산 버스 도착 정보 — 가까운 정류장과 도착 예정 시간',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1d6fd8',
    lang: 'ko',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}
