import { useState, useRef, useEffect } from "react";

function ts() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

export default function SimulateTab({ config, onComplete }) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [logs, setLogs] = useState([]);
  const consoleRef = useRef(null);

  // Auto-scroll console
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (text, type = "info") => {
    setLogs((prev) => [...prev, { text, type, time: ts() }]);
  };

  const runSimulation = () => {
    setRunning(true);
    setDone(false);
    setHasError(false);
    setLogs([]);

    addLog("Connecting to backend…");

    fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        population_size: config.population_size,
        tick_limit: config.tick_limit,
        profile_seed: config.profile_seed,
      }),
    })
      .then((response) => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const parseSSE = (chunk) => {
          buffer += chunk;
          const messages = buffer.split("\n\n");
          buffer = messages.pop(); // last incomplete chunk

          for (const msg of messages) {
            if (!msg.trim()) continue;
            const lines = msg.split("\n");
            let event = "message",
              data = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) event = line.slice(7).trim();
              if (line.startsWith("data: ")) data = line.slice(6);
            }
            if (event === "log") {
              addLog(data, "info");
            } else if (event === "error") {
              addLog(data, "error");
              setHasError(true);
            } else if (event === "success") {
              addLog(data, "success");
            } else if (event === "done") {
              setRunning(false);
              setDone(true);
            }
          }
        };

        const read = () => {
          reader.read().then(({ done: streamDone, value }) => {
            if (streamDone) {
              setRunning(false);
              setDone(true);
              return;
            }
            parseSSE(decoder.decode(value, { stream: true }));
            read();
          });
        };
        read();
      })
      .catch((err) => {
        addLog(`Connection failed: ${err.message}`, "error");
        setRunning(false);
        setHasError(true);
      });
  };

  return (
    <div className="fade-in" style={{ maxWidth: 760 }}>
      <div className="section-header">
        <div>
          <div className="section-title">Run Simulation</div>
          <div className="section-sub">
            Runs all configured recommender algorithms end-to-end
          </div>
        </div>
      </div>

      {/* Config summary card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Current Configuration</div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {[
            { label: "Agents", value: config.population_size.toLocaleString() },
            { label: "Ticks", value: config.tick_limit },
            { label: "Seed", value: config.profile_seed },
            { label: "Algorithms", value: config.algorithms.join(", ") },
          ].map(({ label, value }) => (
            <div key={label}>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "var(--muted)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  color: "var(--text)",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Run button */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <button
          id="run-simulation-btn"
          className="btn btn-primary"
          onClick={runSimulation}
          disabled={running}
          style={{ fontSize: "1rem", padding: "12px 30px" }}
        >
          {running ? (
            <>
              <div
                className="spinner"
                style={{ width: 16, height: 16, borderWidth: 2 }}
              />{" "}
              Running…
            </>
          ) : (
            <> ▶&nbsp; Run Simulation</>
          )}
        </button>

        {done && !hasError && (
          <button
            id="goto-results-btn"
            className="btn btn-ghost"
            onClick={onComplete}
          >
            View Results →
          </button>
        )}
      </div>

      {/* Progress bar */}
      {running && (
        <div className="progress-bar-wrap">
          <div className="progress-bar indeterminate" />
        </div>
      )}

      {/* Console */}
      {logs.length > 0 && (
        <div>
          <div className="card-title" style={{ marginBottom: 8 }}>
            Console output
            {done && (
              <span style={{ marginLeft: 10 }}>
                {hasError ? (
                  <span style={{ color: "var(--red)" }}>● Failed</span>
                ) : (
                  <span style={{ color: "var(--green)" }}>● Complete</span>
                )}
              </span>
            )}
          </div>
          <div className="console-box" ref={consoleRef}>
            {logs.map((log, i) => (
              <div key={i} className={`log-line ${log.type}`}>
                <span className="log-time">{log.time}</span>
                <span>{log.text}</span>
              </div>
            ))}
            {running && (
              <div className="log-line">
                <span className="log-time">{ts()}</span>
                <span style={{ opacity: 0.5 }}>▋</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {logs.length === 0 && !running && (
        <div className="empty-state" style={{ paddingTop: 40 }}>
          <div className="empty-icon">🚀</div>
          <div className="empty-title">Ready to simulate</div>
          <div className="empty-desc">
            Click "Run Simulation" to start. The console will stream live output
            as each algorithm runs. Results will auto-appear in the Results tab
            when complete.
          </div>
        </div>
      )}
    </div>
  );
}
