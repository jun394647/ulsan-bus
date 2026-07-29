import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '울산버스',
  description: '울산 버스 도착 정보 — 내 위치에서 가까운 정류장과 도착 예정 시간',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // 한글 폰트는 시스템 폰트를 쓴다. Geist는 한글 글리프가 없어서
    // 어차피 폴백되는데, 웹폰트 로딩만 추가된다.
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
