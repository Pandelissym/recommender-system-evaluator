import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import MetricsPanel from './MetricsPanel'

const ALGO_LABELS = {
  popularity:     'Popularity',
  interests:      'Interest Match',
  sustainability: 'Sustainability',
}

const ALGO_PILL_CLASS = {
  popularity:     'active-pop',
  interests:      'active-int',
  sustainability: 'active-sus',
}

const TOP_TABLE_ROWS = 10
const TOP_LABELS     = 3

// RdYlGn-reversed color ramp (green=empty → red=overcrowded)
const RAMP = [
  [0.0, [26,  152, 80]],
  [0.2, [145, 207, 96]],
  [0.4, [217, 239, 139]],
  [0.6, [254, 224, 139]],
  [0.8, [252, 141, 89]],
  [1.0, [215, 48,  39]],
]

function crowdColor(ratio) {
  const r = Math.max(0, Math.min(1, ratio))
  for (let i = 1; i < RAMP.length; i++) {
    if (r <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1]
      const [t1, c1] = RAMP[i]
      const f = (r - t0) / (t1 - t0)
      const mix = c0.map((v, k) => Math.round(v + (c1[k] - v) * f))
      return `rgb(${mix[0]},${mix[1]},${mix[2]})`
    }
  }
  return 'rgb(215,48,39)'
}

function radiusFor(visitors, maxVisitors) {
  if (maxVisitors <= 0) return 5
  return 5 + 17 * Math.sqrt(visitors / maxVisitors)
}

export default function ResultsTab() {
  const [appData, setAppData]       = useState(null)   // { viz_data, metrics }
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [currentAlgo, setCurrentAlgo] = useState(null)
  const [currentTick, setCurrentTick] = useState(0)
  const [playing, setPlaying]       = useState(false)
  const [speed, setSpeed]           = useState(400)
  const [topRows, setTopRows]       = useState([])

  // All Leaflet state lives in refs — never touches React re-renders
  const mapDivRef   = useRef(null)
  const mapRef      = useRef(null)       // L.Map instance
  const markersRef  = useRef([])         // L.circleMarker[]

  // Playback refs (avoid stale closures in setInterval)
  const timerRef    = useRef(null)
  const tickRef     = useRef(0)
  const algoRef     = useRef(null)
  const speedRef    = useRef(400)
  const vizRef      = useRef(null)       // viz_data reference

  // ── Keep refs in sync with state ─────────────────────────────────
  useEffect(() => { algoRef.current = currentAlgo }, [currentAlgo])
  useEffect(() => { speedRef.current = speed },       [speed])
  useEffect(() => { tickRef.current  = currentTick }, [currentTick])

  // ── Fetch results ─────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/results')
      .then(r => r.json())
      .then(res => {
        if (!res.available || !res.viz_data) {
          setError('No results found. Run the simulation first.')
          setLoading(false)
          return
        }
        vizRef.current = res.viz_data
        setAppData({ viz: res.viz_data, metrics: res.metrics })
        setCurrentAlgo(res.viz_data.algos[0])
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  // ── Init Leaflet map once data is ready ────────────────────────────
  useEffect(() => {
    if (!appData || !mapDivRef.current || mapRef.current) return

    const map = L.map(mapDivRef.current, { zoomControl: true })
      .setView([41.395, 2.17], 13)
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    markersRef.current = appData.viz.pois.map(poi => {
      const m = L.circleMarker([poi.lat, poi.lon], {
        radius: 6,
        fillColor: crowdColor(0),
        fillOpacity: 0.85,
        color: '#fff',
        weight: 1.2,
        opacity: 0.7,
      }).addTo(map)
      m.bindTooltip('', { className: 'poi-tooltip', direction: 'top', offset: [0, -6] })
      return m
    })

    setTimeout(() => map.invalidateSize(), 100)

    return () => {
      map.remove()
      mapRef.current   = null
      markersRef.current = []
    }
  }, [appData])

  // ── Core render function (pure, no hooks) ─────────────────────────
  function renderTick(algo, tick) {
    const viz = vizRef.current
    if (!viz || !algo) return
    const frame = viz.series[algo]?.[tick]
    if (!frame) return

    let maxV = 0
    for (const [v] of frame) if (v > maxV) maxV = v

    const ranked = frame
      .map(([visitors, ratio], idx) => ({ idx, visitors, ratio }))
      .sort((a, b) => b.ratio - a.ratio || b.visitors - a.visitors)

    const labelSet = new Set(ranked.slice(0, TOP_LABELS).map(e => e.idx))

    frame.forEach(([visitors, ratio], idx) => {
      const poi    = viz.pois[idx]
      const marker = markersRef.current[idx]
      if (!marker) return

      marker.setStyle({ fillColor: crowdColor(ratio), radius: radiusFor(visitors, maxV) })
      marker.setTooltipContent(
        `<strong>${poi.name}</strong><br>` +
        `${poi.neighborhood} · ${poi.category}<br>` +
        `Visitors: <b>${visitors}</b> &nbsp; Crowd: <b>${(ratio * 100).toFixed(1)}%</b>`
      )

      if (mapRef.current) {
        if (labelSet.has(idx)) {
          if (!marker._lbl) {
            marker._lbl = L.tooltip({ permanent: true, direction: 'right', offset: [10, 0], className: 'poi-label' })
              .setLatLng([poi.lat, poi.lon])
              .setContent(poi.name)
              .addTo(mapRef.current)
          }
        } else if (marker._lbl) {
          mapRef.current.removeLayer(marker._lbl)
          marker._lbl = null
        }
      }
    })

    // Update sidebar table
    setTopRows(ranked.slice(0, TOP_TABLE_ROWS).map((e, i) => ({
      rank: i + 1,
      name:         viz.pois[e.idx].name,
      neighborhood: viz.pois[e.idx].neighborhood,
      visitors: e.visitors,
      ratio:    e.ratio,
      color:    crowdColor(e.ratio),
    })))
  }

  // Re-render whenever algo or tick changes
  useEffect(() => {
    if (appData) renderTick(currentAlgo, currentTick)
  }, [appData, currentAlgo, currentTick]) // eslint-disable-line

  // ── Playback controls ─────────────────────────────────────────────
  function stopPlaying() {
    clearInterval(timerRef.current)
    timerRef.current = null
    setPlaying(false)
  }

  function startPlaying() {
    setPlaying(true)
    timerRef.current = setInterval(() => {
      const nTicks = vizRef.current?.ticks ?? 36
      const next   = (tickRef.current + 1) % nTicks
      tickRef.current = next
      setCurrentTick(next)
      renderTick(algoRef.current, next)
    }, speedRef.current)
  }

  function togglePlay() {
    if (playing) { stopPlaying() } else { startPlaying() }
  }

  // Restart interval if speed changes while playing
  useEffect(() => {
    if (playing) {
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        const nTicks = vizRef.current?.ticks ?? 36
        const next   = (tickRef.current + 1) % nTicks
        tickRef.current = next
        setCurrentTick(next)
        renderTick(algoRef.current, next)
      }, speed)
    }
  }, [speed]) // eslint-disable-line

  // Cleanup on unmount
  useEffect(() => () => clearInterval(timerRef.current), [])

  const handleSlider = e => {
    const t = parseInt(e.target.value, 10)
    stopPlaying()
    setCurrentTick(t)
  }

  const handleAlgoSwitch = algo => {
    stopPlaying()
    setCurrentAlgo(algo)
  }

  // ── States ─────────────────────────────────────────────────────────
  if (loading) return (
    <div className="empty-state">
      <div className="spinner" />
      <div className="empty-title">Loading results…</div>
    </div>
  )

  if (error || !appData) return (
    <div className="empty-state">
      <div className="empty-icon">📭</div>
      <div className="empty-title">No results available</div>
      <div className="empty-desc">
        {error || 'Go to the Simulate tab and run the simulation first.'}
      </div>
    </div>
  )

  const { viz, metrics } = appData
  const nTicks = viz.ticks

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="fade-in">

      {/* ── Metrics panels ── */}
      {metrics && <MetricsPanel metrics={metrics} algos={viz.algos} />}

      {/* ── Map section ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

        {/* Map toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10,
        }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Tick-by-tick crowding map</span>
            <span style={{ marginLeft: 12, fontSize: '0.8rem', color: 'var(--muted)' }}>
              Tick <b style={{ color: 'var(--accent)' }}>{currentTick + 1}</b> / {nTicks}
            </span>
          </div>
          <div className="algo-pills">
            {viz.algos.map(algo => (
              <button
                key={algo}
                id={`algo-pill-${algo}`}
                className={`algo-pill${currentAlgo === algo ? ' ' + ALGO_PILL_CLASS[algo] : ''}`}
                onClick={() => handleAlgoSwitch(algo)}
              >
                {ALGO_LABELS[algo] || algo}
              </button>
            ))}
          </div>
        </div>

        {/* Map + sidebar row */}
        <div style={{ display: 'flex', height: 460 }}>

          {/* Leaflet map */}
          <div ref={mapDivRef} style={{ flex: '1 1 65%', minWidth: 0 }} />

          {/* Crowding sidebar */}
          <div style={{
            flex: '0 0 300px', borderLeft: '1px solid var(--border)',
            overflowY: 'auto', padding: '12px 14px',
          }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Most crowded</div>
            <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '1px solid var(--border)', cursor: 'default' }}>#</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '1px solid var(--border)', cursor: 'default' }}>POI</th>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '1px solid var(--border)', cursor: 'default' }}>Crowd</th>
                </tr>
              </thead>
              <tbody>
                {topRows.map(row => (
                  <tr key={row.rank} style={{ borderBottom: '1px solid #1e1e32' }}>
                    <td style={{ padding: '7px 8px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', width: 24 }}>{row.rank}</td>
                    <td style={{ padding: '7px 8px', maxWidth: 120 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{row.neighborhood}</div>
                    </td>
                    <td style={{ padding: '7px 8px', minWidth: 90 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{
                          height: 6, borderRadius: 3, flexShrink: 0,
                          width: `${Math.min(100, row.ratio * 100) * 0.5}px`,
                          background: row.color,
                          transition: 'width 0.3s, background 0.3s',
                        }} />
                        <span style={{ fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text2)', flexShrink: 0 }}>
                          {(row.ratio * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {topRows.length === 0 && (
                  <tr><td colSpan={3} style={{ padding: 20, color: 'var(--muted)', textAlign: 'center' }}>No visitors this tick</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Playback bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '12px 18px', borderTop: '1px solid var(--border)',
          background: 'var(--panel2)',
        }}>

          {/* Play/Pause */}
          <button
            id="playback-play-btn"
            className="play-btn"
            onClick={togglePlay}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? '⏸' : '▶'}
          </button>

          {/* Slider */}
          <input
            id="tick-slider"
            type="range"
            className="tick-slider"
            style={{ flex: 1, accentColor: 'var(--accent)' }}
            min={0}
            max={nTicks - 1}
            value={currentTick}
            step={1}
            onChange={handleSlider}
          />

          {/* Tick counter */}
          <span style={{
            fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace',
            color: 'var(--muted)', minWidth: 84, textAlign: 'right',
          }}>
            Tick <b style={{ color: 'var(--text)' }}>{currentTick + 1}</b> / {nTicks}
          </span>

          {/* Speed */}
          <select
            id="speed-select"
            className="speed-select"
            value={speed}
            onChange={e => setSpeed(parseInt(e.target.value))}
          >
            <option value={1200}>0.5×</option>
            <option value={600}>1×</option>
            <option value={300}>2×</option>
            <option value={150}>4×</option>
          </select>

          {/* Legend */}
          <div className="legend">
            <span>empty</span>
            <div className="legend-bar" />
            <span>overcrowded</span>
          </div>
        </div>
      </div>
    </div>
  )
}
