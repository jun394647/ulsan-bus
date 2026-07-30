'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { NearbyStop } from '@/lib/models'
import { formatDistance, walkingMinutes } from '@/lib/geo'

/**
 * 근처 정류장 지도.
 *
 * 목록만으로는 "공업탑 40401 / 40402 / 40403"이 각각 어느 쪽 도로변인지 알 수 없다.
 * 울산 정류소의 47%가 동명이라 위치를 눈으로 봐야 고를 수 있는 경우가 많다.
 *
 * react-leaflet 대신 Leaflet을 직접 쓴다. 지도는 자체 상태를 가진 명령형 위젯이라
 * 래퍼를 한 겹 두면 마커 갱신 시점을 통제하기가 오히려 까다롭다.
 *
 * 타일은 CartoDB를 쓴다. API 키가 필요 없고 라이트/다크 두 벌이 있다.
 */

interface Props {
  center: { lat: number; lng: number }
  stops: NearbyStop[]
}

const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

/** 정류장 마커. 기본 아이콘은 Next.js 번들에서 경로가 깨지므로 직접 만든다. */
function stopIcon(label: string) {
  return L.divIcon({
    className: '',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:28px;height:28px;border-radius:9999px;
      background:var(--accent);color:#fff;
      font-size:11px;font-weight:700;
      border:2px solid var(--background);
      box-shadow:0 1px 4px rgba(0,0,0,.35);
    ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

const meIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:16px;height:16px;border-radius:9999px;
    background:#1d6fd8;border:3px solid #fff;
    box-shadow:0 0 0 3px rgba(29,111,216,.3);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

export default function StopMap({ center, stops }: Props) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  const isDark = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
    [],
  )

  // 지도 생성은 한 번만. 이후에는 마커만 갈아끼운다.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 16,
      // 휠·핀치·더블탭 모두 바로 줌이 되게 한다.
      scrollWheelZoom: true,
      touchZoom: true,
      doubleClickZoom: true,
      // 휠 줌이 너무 민감하면 페이지를 스크롤하려다 확대돼 버린다.
      wheelPxPerZoomLevel: 120,
      zoomSnap: 0.5,
      attributionControl: true,
    })

    L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, {
      attribution: ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map)

    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [center.lat, center.lng, isDark])

  // 위치나 정류장이 바뀌면 마커를 다시 그린다.
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    layer.clearLayers()

    // 내 위치는 정류장 마커보다 뒤에 둔다. 바로 앞 정류장일수록 좌표가 겹치는데,
    // 내 위치가 위에 있으면 정작 눌러야 할 정류장이 가려진다.
    L.marker([center.lat, center.lng], { icon: meIcon, zIndexOffset: -1000 })
      .bindTooltip('내 위치', { direction: 'top' })
      .addTo(layer)

    for (const [index, stop] of stops.entries()) {
      L.marker([stop.lat, stop.lng], { icon: stopIcon(String(index + 1)) })
        .bindTooltip(
          `${stop.name} · ${formatDistance(stop.distance)} (도보 ${walkingMinutes(stop.distance)}분)`,
          { direction: 'top' },
        )
        .on('click', () => router.push(`/stop/${stop.nodeid}`))
        .addTo(layer)
    }

    // 내 위치와 정류장이 모두 보이도록 맞춘다.
    if (stops.length > 0) {
      const bounds = L.latLngBounds([
        [center.lat, center.lng],
        ...stops.map((s) => [s.lat, s.lng] as [number, number]),
      ])
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 })
    }
  }, [center.lat, center.lng, stops, router])

  return (
    <div
      ref={containerRef}
      className="h-[300px] w-full overflow-hidden rounded-xl border border-[var(--color-border)]"
      // Leaflet의 기본 z-index가 높아 헤더 위로 올라오는 것을 막는다.
      style={{ zIndex: 0 }}
    />
  )
}
