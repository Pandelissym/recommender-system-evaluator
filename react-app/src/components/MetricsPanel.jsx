import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Radar } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
)

const ALGO_COLORS = {
  popularity:    { bg: 'rgba(245,158,11,0.25)',  border: '#fbbf24' },
  interests:     { bg: 'rgba(79,140,255,0.25)',  border: '#7fb3ff' },
  sustainability:{ bg: 'rgba(34,197,94,0.20)',   border: '#4ade80' },
}

const ALGO_LABELS = {
  popularity:    'Popularity',
  interests:     'Interest Match',
  sustainability: 'Sustainability',
}

function fmt(v, isPercent = false) {
  if (v == null) return '–'
  if (isPercent) return (v * 100).toFixed(1) + '%'
  return typeof v === 'number' ? v.toFixed(3) : v
}

const CHART_OPTS_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#b0b0d0', font: { family: 'Inter', size: 11 }, boxWidth: 12 },
    },
    tooltip: {
      backgroundColor: 'rgba(14,14,28,0.96)',
      borderColor: '#2e2e50',
      borderWidth: 1,
      titleColor: '#e8e8f5',
      bodyColor: '#b0b0d0',
      padding: 10,
      titleFont: { family: 'Inter', weight: 'bold' },
      bodyFont: { family: 'Inter' },
    },
  },
  scales: {
    x: {
      ticks: { color: '#7070a0', font: { family: 'Inter', size: 11 } },
      grid: { color: '#2e2e50' },
    },
    y: {
      ticks: { color: '#7070a0', font: { family: 'Inter', size: 11 } },
      grid: { color: '#2e2e50' },
    },
  },
}

const RADAR_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#b0b0d0', font: { family: 'Inter', size: 11 }, boxWidth: 12 },
    },
    tooltip: {
      backgroundColor: 'rgba(14,14,28,0.96)',
      borderColor: '#2e2e50',
      borderWidth: 1,
      titleColor: '#e8e8f5',
      bodyColor: '#b0b0d0',
      padding: 10,
    },
  },
  scales: {
    r: {
      ticks: { color: '#7070a0', backdropColor: 'transparent', font: { size: 10 } },
      grid: { color: '#2e2e50' },
      pointLabels: { color: '#b0b0d0', font: { family: 'Inter', size: 11 } },
      min: 0,
      max: 1,
    },
  },
}

export default function MetricsPanel({ metrics, algos }) {
  if (!metrics || !algos?.length) return null

  // ── Key metric cards ──────────────────────────────────────────
  const KEY_METRICS = [
    { key: 'precision_at_5',                   label: 'Precision@5',        isPercent: true,  higherBetter: true  },
    { key: 'recall_at_5',                      label: 'Recall@5',           isPercent: true,  higherBetter: true  },
    { key: 'diversity_visited_share',           label: 'Diversity (visited)',isPercent: true,  higherBetter: true  },
    { key: 'spatial_overcrowding_events_total', label: 'Overcrowding Events',isPercent: false, higherBetter: false },
    { key: 'neighborhood_gini',                 label: 'Neighborhood Gini',  isPercent: false, higherBetter: false },
    { key: 'trust_share_interest_ge_median',    label: 'Trust Share',        isPercent: true,  higherBetter: true  },
  ]

  // ── Bar chart: quality metrics ────────────────────────────────
  const barLabels = ['Precision@5', 'Recall@5', 'Diversity', 'Trust Share']
  const barData = {
    labels: barLabels,
    datasets: algos.map(algo => ({
      label: ALGO_LABELS[algo] || algo,
      data: [
        metrics[algo]?.precision_at_5 ?? 0,
        metrics[algo]?.recall_at_5 ?? 0,
        metrics[algo]?.diversity_visited_share ?? 0,
        metrics[algo]?.trust_share_interest_ge_median ?? 0,
      ],
      backgroundColor: ALGO_COLORS[algo]?.bg || 'rgba(100,100,200,0.3)',
      borderColor: ALGO_COLORS[algo]?.border || '#aaa',
      borderWidth: 1.5,
      borderRadius: 4,
    })),
  }

  // ── Radar chart: normalised multi-dim ─────────────────────────
  const radarLabels = ['Precision', 'Recall', 'Diversity', 'Trust', 'Fairness\n(1-gini)', 'No Crowding']

  const maxOvercrowd = Math.max(...algos.map(a => metrics[a]?.spatial_overcrowding_events_total ?? 0)) || 1
  const maxGini      = Math.max(...algos.map(a => metrics[a]?.neighborhood_gini ?? 0)) || 1

  const radarData = {
    labels: radarLabels,
    datasets: algos.map(algo => {
      const m = metrics[algo] || {}
      return {
        label: ALGO_LABELS[algo] || algo,
        data: [
          m.precision_at_5 ?? 0,
          m.recall_at_5 ?? 0,
          m.diversity_visited_share ?? 0,
          m.trust_share_interest_ge_median ?? 0,
          1 - (m.neighborhood_gini ?? 0) / maxGini,
          1 - (m.spatial_overcrowding_events_total ?? 0) / (maxOvercrowd * 1.5),
        ],
        backgroundColor: ALGO_COLORS[algo]?.bg || 'rgba(100,100,200,0.2)',
        borderColor: ALGO_COLORS[algo]?.border || '#aaa',
        borderWidth: 2,
        pointBackgroundColor: ALGO_COLORS[algo]?.border || '#aaa',
        pointRadius: 4,
      }
    }),
  }

  return (
    <div>
      {/* ── Metric cards ── */}
      <div style={{ marginBottom: 6 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Metrics Summary</div>
      </div>
      <div className="metric-grid" style={{ marginBottom: 24 }}>
        {KEY_METRICS.map(({ key, label, isPercent, higherBetter }) => {
          const vals = algos.map(a => ({ algo: a, val: metrics[a]?.[key] ?? null }))
          const numeric = vals.filter(v => v.val != null)
          const best = numeric.reduce((b, c) =>
            higherBetter ? (c.val > b.val ? c : b) : (c.val < b.val ? c : b),
            numeric[0]
          )
          return (
            <div key={key} className="metric-card">
              <div className="metric-label">{label}</div>
              {vals.map(({ algo, val }) => {
                const isBest = best?.algo === algo
                return (
                  <div key={algo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <span style={{ fontSize: '0.72rem', color: ALGO_COLORS[algo]?.border || 'var(--muted)' }}>
                      {ALGO_LABELS[algo]}
                    </span>
                    <span
                      style={{
                        fontSize: '0.9rem',
                        fontWeight: isBest ? 700 : 400,
                        color: isBest ? (higherBetter ? 'var(--green)' : 'var(--green)') : 'var(--text2)',
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                    >
                      {fmt(val, isPercent)}
                      {isBest && numeric.length > 1 && ' ✓'}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* ── Charts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">Quality Metrics (higher = better)</div>
          <div style={{ height: 240 }}>
            <Bar data={barData} options={CHART_OPTS_BASE} />
          </div>
        </div>

        <div className="card">
          <div className="card-title">Multi-dimensional Radar</div>
          <div style={{ height: 240 }}>
            <Radar data={radarData} options={RADAR_OPTS} />
          </div>
        </div>
      </div>

      {/* ── Comparison table ── */}
      <div className="card" style={{ marginBottom: 4 }}>
        <div className="card-title">Full metrics comparison</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ cursor: 'default' }}>Metric</th>
                {algos.map(a => (
                  <th key={a} className={`num algo-col-${a.substring(0, 3)}`} style={{ cursor: 'default' }}>
                    {ALGO_LABELS[a] || a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'precision_at_5',                   label: 'Precision@5',            pct: true },
                { key: 'recall_at_5',                      label: 'Recall@5',               pct: true },
                { key: 'diversity_visited_share',           label: 'Diversity visited',       pct: true },
                { key: 'diversity_recommended_share',       label: 'Diversity recommended',   pct: true },
                { key: 'trust_share_interest_ge_median',   label: 'Trust share',             pct: true },
                { key: 'interest_match_mean',               label: 'Interest match (mean)',   pct: false },
                { key: 'spatial_overcrowding_events_total', label: 'Overcrowding events',     pct: false },
                { key: 'spatial_peak_crowding_ratio_max',  label: 'Peak crowding ratio',     pct: false },
                { key: 'neighborhood_gini',                 label: 'Neighborhood Gini',       pct: false },
                { key: 'top10_popular_share',              label: 'Top-10 popular share',    pct: true },
                { key: 'fairness_mean_abs_disparity',      label: 'Fairness MAD',            pct: false },
                { key: 'fairness_max_disparity',           label: 'Fairness max disparity',  pct: false },
              ].map(({ key, label, pct }) => (
                <tr key={key}>
                  <td style={{ color: 'var(--text2)', fontWeight: 500 }}>{label}</td>
                  {algos.map(a => (
                    <td key={a} className="num">
                      {fmt(metrics[a]?.[key], pct)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
