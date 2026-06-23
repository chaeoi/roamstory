import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { places, gallery } from '../data/travels'

const CHINA_CENTER = [104.5, 36]
const CHINA_ZOOM = 5
const WORLD_CENTER = [70, 18]   // 世界视图固定中心（让中国偏右、整体居中）
const WORLD_ZOOM = 1.4
const WORLD_THRESHOLD = 2.4     // 缩放低于此值视为“世界视图”
const MIN_ZOOM = 1
const MAX_ZOOM = 12
const FONT = '"LXGW WenKai Screen", "PingFang SC", "Microsoft YaHei", sans-serif'

const PHOTO_PLACES = new Set(gallery.map((g) => g.place))

// 区域名改中文 + 南海诸岛归一化
function normalizeMap(geoJson) {
  geoJson.features?.forEach((f) => {
    const p = f.properties || {}
    if (p.adchar === 'JD' || p.adcode === '100000_JD') {
      p.name = '南海诸岛'
    } else if (p.NAME_ZH) {
      p.name = p.NAME_ZH
    }
    f.properties = p
  })
}

const toPoint = (pl) => ({
  name: pl.name,
  value: [pl.latLng[1], pl.latLng[0]],
  hasPhoto: PHOTO_PLACES.has(pl.name),
})

export default function MapSection({ onSelectPlace }) {
  const elRef = useRef(null)
  const chartRef = useRef(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let disposed = false

    async function init() {
      const res = await fetch('/maps/world-china-detail.json')
      const geo = await res.json()
      if (disposed) return
      normalizeMap(geo)
      echarts.registerMap('china-detail', geo)

      const chart = echarts.init(elRef.current, null, { renderer: 'canvas' })
      chartRef.current = chart

      const withPhoto = places.filter((p) => PHOTO_PLACES.has(p.name)).map(toPoint)
      const withoutPhoto = places.filter((p) => !PHOTO_PLACES.has(p.name)).map(toPoint)

      chart.setOption({
        backgroundColor: 'transparent',
        textStyle: { fontFamily: FONT },
        tooltip: {
          trigger: 'item',
          borderWidth: 0,
          padding: [6, 10],
          backgroundColor: 'rgba(31,35,40,0.92)',
          textStyle: { color: '#fff', fontSize: 13, fontFamily: FONT },
          formatter: (p) => {
            if (p.componentType === 'series') {
              return p.data?.hasPhoto ? `${p.data.name} · 点击看相册` : p.data?.name || ''
            }
            return p.name || ''
          },
        },
        geo: {
          map: 'china-detail',
          roam: true,
          center: CHINA_CENTER,
          zoom: CHINA_ZOOM,
          layoutCenter: ['50%', '50%'],
          layoutSize: '120%',
          scaleLimit: { min: MIN_ZOOM, max: MAX_ZOOM },
          label: { show: false },
          itemStyle: {
            areaColor: '#eef3f7',
            borderColor: '#c4d0dc',
            borderWidth: 0.75,
          },
          emphasis: {
            label: { show: false },
            itemStyle: { areaColor: '#dbeafe' },
          },
          select: { disabled: true },
          regions: [
            {
              name: '南海诸岛',
              itemStyle: { areaColor: 'rgba(216,77,77,0.05)', borderColor: '#8d9cac', borderWidth: 0.8 },
            },
          ],
        },
        series: [
          {
            name: '足迹',
            type: 'scatter',
            coordinateSystem: 'geo',
            zlevel: 2,
            data: withoutPhoto,
            symbol: 'circle',
            symbolSize: 8,
            itemStyle: { color: '#9aa7b4', borderColor: '#fff', borderWidth: 1.5 },
            emphasis: { scale: 1.5, itemStyle: { color: '#687076' } },
          },
          {
            name: '相册',
            type: 'scatter',
            coordinateSystem: 'geo',
            zlevel: 3,
            data: withPhoto,
            symbol: 'circle',
            symbolSize: 9,
            itemStyle: { color: '#d84d4d', borderColor: '#fff', borderWidth: 1.5 },
            emphasis: { scale: 1.4 },
          },
        ],
      })

      chart.on('click', (params) => {
        if (params.seriesName === '相册' && params.data?.name) {
          onSelectPlace(params.data.name)
        }
      })
      chart.on('mouseover', (params) => {
        if (params.seriesName === '相册') chart.getZr().setCursorStyle('pointer')
      })
      chart.on('mouseout', () => chart.getZr().setCursorStyle('default'))

      // 缩放越过“世界视图”阈值时，把视角固定到合理的世界框景
      let wasWorld = false
      chart.on('georoam', () => {
        const geo = chart.getOption().geo?.[0]
        if (!geo) return
        const isWorld = geo.zoom <= WORLD_THRESHOLD
        if (isWorld && !wasWorld) {
          // 刚进入世界视图：归位到固定世界中心
          chart.setOption({ geo: { center: WORLD_CENTER } })
        }
        wasWorld = isWorld
      })

      const onResize = () => chart.resize()
      window.addEventListener('resize', onResize)
      chart._onResize = onResize
      setLoading(false)
    }

    init()

    return () => {
      disposed = true
      if (chartRef.current) {
        window.removeEventListener('resize', chartRef.current._onResize)
        chartRef.current.dispose()
        chartRef.current = null
      }
    }
  }, [onSelectPlace])

  return (
    <section className="fixed inset-x-0 bottom-0 top-14 bg-[#eef1f3] overflow-hidden">
      <div ref={elRef} className="w-full h-full" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <span className="w-4 h-4 border-2 border-gray-300 border-t-[#2761ad] rounded-full animate-spin" />
            地图加载中…
          </div>
        </div>
      )}

      {/* 图例 */}
      <div className="absolute top-4 left-4 flex flex-col gap-1.5 bg-white/90 backdrop-blur rounded-lg px-3 py-2.5 shadow-sm border border-gray-100 text-xs text-gray-500">
        <span className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#d84d4d]" /> 有相册（可点击）
        </span>
        <span className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#9aa7b4]" /> 到过
        </span>
      </div>

      {/* 统计 */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-lg px-4 py-2.5 shadow-sm border border-gray-100">
        <div className="text-xs text-gray-400">足迹</div>
        <div className="text-lg font-semibold text-gray-900">
          {places.length} <span className="text-sm font-normal text-gray-400">座城市</span>
        </div>
      </div>
    </section>
  )
}
