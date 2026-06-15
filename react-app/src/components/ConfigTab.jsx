const ALGOS = [
  {
    key: 'popularity',
    name: 'Popularity',
    desc: 'Recommends globally popular POIs regardless of user interests',
    badge: 'badge-amber',
  },
  {
    key: 'interests',
    name: 'Interest Match',
    desc: "Matches POIs to each tourist's declared interest categories",
    badge: 'badge-blue',
  },
  {
    key: 'sustainability',
    name: 'Sustainability',
    desc: 'Balances personalisation with crowd-spreading and fairness goals',
    badge: 'badge-green',
  },
]

export default function ConfigTab({ config, setConfig }) {
  const update = patch => setConfig(prev => ({ ...prev, ...patch }))

  const toggleAlgo = key => {
    const next = config.algorithms.includes(key)
      ? config.algorithms.filter(a => a !== key)
      : [...config.algorithms, key]
    if (next.length > 0) update({ algorithms: next })
  }

  return (
    <div className="fade-in" style={{ maxWidth: 680 }}>
      <div className="section-header">
        <div>
          <div className="section-title">Simulation Configuration</div>
          <div className="section-sub">Parameters passed to <code>run_experiment.py</code></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Agent Parameters</div>

        {/* Population size */}
        <div className="form-row">
          <label className="form-label" htmlFor="pop-size">Population size</label>
          <div className="form-sublabel">Number of tourist agents in the simulation</div>
          <div className="range-row">
            <input
              id="pop-size"
              type="range"
              min={100}
              max={10000}
              step={100}
              value={config.population_size}
              onChange={e => update({ population_size: parseInt(e.target.value) })}
            />
            <span className="range-val">{config.population_size.toLocaleString()}</span>
          </div>
        </div>

        {/* Tick limit */}
        <div className="form-row">
          <label className="form-label" htmlFor="tick-limit">Tick limit</label>
          <div className="form-sublabel">Number of simulation steps (e.g. 36 = 6h × 6 intervals)</div>
          <div className="range-row">
            <input
              id="tick-limit"
              type="range"
              min={6}
              max={120}
              step={6}
              value={config.tick_limit}
              onChange={e => update({ tick_limit: parseInt(e.target.value) })}
            />
            <span className="range-val">{config.tick_limit}</span>
          </div>
        </div>

        {/* Seed */}
        <div className="form-row">
          <label className="form-label" htmlFor="profile-seed">Profile seed</label>
          <div className="form-sublabel">Random seed for tourist profile generation (reproducibility)</div>
          <input
            id="profile-seed"
            type="number"
            value={config.profile_seed}
            onChange={e => update({ profile_seed: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-title">Recommender Algorithms</div>
        <div className="form-sublabel" style={{ marginBottom: 14 }}>
          Select which algorithms to run and compare
        </div>
        <div className="checkbox-group">
          {ALGOS.map(algo => {
            const checked = config.algorithms.includes(algo.key)
            return (
              <label
                key={algo.key}
                id={`algo-toggle-${algo.key}`}
                className={`checkbox-item${checked ? ' checked' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleAlgo(algo.key)}
                />
                <div className="checkbox-item-label">
                  <span className="checkbox-item-name">
                    <span className={`badge ${algo.badge}`} style={{ marginRight: 8 }}>{algo.name}</span>
                  </span>
                  <span className="checkbox-item-desc">{algo.desc}</span>
                </div>
              </label>
            )
          })}
        </div>

        {config.algorithms.length === 0 && (
          <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: 10 }}>
            ⚠️ At least one algorithm must be selected
          </div>
        )}
      </div>

      {/* Summary */}
      <div style={{ marginTop: 20, padding: '14px 18px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, fontSize: '0.8rem', color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>
        python run_experiment.py --population_size {config.population_size} --tick_limit {config.tick_limit} --profile_seed {config.profile_seed}
      </div>
    </div>
  )
}
