import { useState } from "react";
import DataTab from "./components/DataTab";
import ConfigTab from "./components/ConfigTab";
import SimulateTab from "./components/SimulateTab";
import ResultsTab from "./components/ResultsTab";

const TABS = [
  { id: "data", label: "POI Data", icon: "🗺️" },
  { id: "config", label: "Config", icon: "⚙️" },
  { id: "simulate", label: "Simulate", icon: "▶" },
  { id: "results", label: "Results", icon: "📊" },
];

const DEFAULT_CONFIG = {
  population_size: 3000,
  tick_limit: 36,
  profile_seed: 12345,
  algorithms: ["popularity", "interests", "sustainability"],
};

export default function App() {
  const [activeTab, setActiveTab] = useState("data");
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  const goToResults = () => setActiveTab("results");

  return (
    <div className="app">
      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="topbar-brand">
          <h1>Barcelona POI Recommender</h1>
          <span>Agent-based simulation evaluator</span>
        </div>

        <nav className="tab-nav" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`tab-btn-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`tab-btn${activeTab === tab.id ? " active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Tab panels ── */}
      <main className="tab-content">
        {activeTab === "data" && <DataTab />}
        {activeTab === "config" && (
          <ConfigTab config={config} setConfig={setConfig} />
        )}
        {activeTab === "simulate" && (
          <SimulateTab config={config} onComplete={goToResults} />
        )}
        {activeTab === "results" && <ResultsTab />}
      </main>
    </div>
  );
}
