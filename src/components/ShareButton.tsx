'use client'

import { useState } from 'react'
import type { Stop } from '@/lib/models'

/**
 * 정류장 공유.
 *
 * "여기서 만나자"를 보낼 때 정류장 이름만으로는 부족하다 — 울산 정류소의 47%가
 * 동명이라 상대가 반대편에 서 있을 수 있다. 링크를 보내면 그 정류장이 특정된다.
 *
 * Web Share API가 없는 환경(대부분의 데스크톱 브라우저)에서는 클립보드에 복사한다.
 */
export function ShareButton({ stop }: { stop: Stop }) {
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const url = `${window.location.origin}/stop/${stop.nodeid}`
    const title = `${stop.name} (${stop.nodeno})`

    if (navigator.share) {
      try {
        await navigator.share({ title, text: `${title} 버스 도착 정보`, url })
        return
      } catch (error) {
        // 사용자가 공유 시트를 닫은 것이면 그대로 끝낸다.
        if (error instanceof Error && error.name === 'AbortError') return
        // 그 밖의 실패(권한·환경 문제)는 아래 클립보드로 넘어간다.
        // 조용히 끝내면 눌렀는데 아무 일도 없는 것처럼 보인다.
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // 클립보드도 막힌 환경에서는 할 수 있는 게 없다. 조용히 넘어간다.
    }
  }

  return (
    <button
      onClick={share}
      className="rounded-lg px-2.5 py-1 font-medium text-[var(--color-accent)] active:bg-[var(--color-surface)]"
    >
      {copied ? '복사됨' : '공유'}
    </button>
  )
}
