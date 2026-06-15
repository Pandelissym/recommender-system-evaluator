from __future__ import annotations

import json
import os
import subprocess
import sys

import pandas as pd
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

from viz_data import build_viz_data

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
POIS_CSV = os.path.join(BASE_DIR, "data", "pois.csv")
RESULTS_DIR = os.path.join(BASE_DIR, "results")

app = Flask(__name__)
CORS(app)


@app.route("/api/pois")
def get_pois():
    df = pd.read_csv(POIS_CSV)
    return jsonify(df.to_dict(orient="records"))


@app.route("/api/results")
def get_results():
    summary_path = os.path.join(RESULTS_DIR, "metrics_summary.json")
    if not os.path.exists(summary_path):
        return jsonify({"available": False, "metrics": None, "algos": [], "viz_data": None})

    with open(summary_path, encoding="utf-8") as f:
        metrics = json.load(f)

    algos_with_ts = [
        algo
        for algo in metrics
        if os.path.exists(
            os.path.join(RESULTS_DIR, f"{algo}_poi_crowding_timeseries.csv")
        )
    ]

    viz_data = build_viz_data(RESULTS_DIR, POIS_CSV,
                              algos=list(metrics.keys()))

    return jsonify(
        {
            "available": True,
            "metrics": metrics,
            "algos": algos_with_ts,
            "viz_data": viz_data,
        }
    )


def _sse_event(data: str, event: str = "message") -> str:
    lines = [f"event: {event}"]
    for line in data.splitlines():
        lines.append(f"data: {line}")
    lines.append("\n")
    return "\n".join(lines)


@app.route("/api/run", methods=["POST"])
def run_simulation():
    body = request.get_json(force=True) or {}
    population_size = int(body.get("population_size", 3000))
    tick_limit = int(body.get("tick_limit", 36))
    profile_seed = int(body.get("profile_seed", 12345))

    os.makedirs(RESULTS_DIR, exist_ok=True)

    def generate():
        yield _sse_event("Starting simulation…", "log")

        cmd_experiment = [
            sys.executable,
            os.path.join(BASE_DIR, "run_experiment.py"),
            "--pois_csv_path", POIS_CSV,
            "--population_size", str(population_size),
            "--tick_limit", str(tick_limit),
            "--profile_seed", str(profile_seed),
            "--out_dir", RESULTS_DIR,
        ]

        try:
            proc = subprocess.Popen(
                cmd_experiment,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                cwd=BASE_DIR,
            )
            for line in proc.stdout:
                yield _sse_event(line.rstrip(), "log")
            proc.wait()
            if proc.returncode != 0:
                yield _sse_event(
                    f"run_experiment.py exited with code {proc.returncode}", "error"
                )
                yield _sse_event("done", "done")
                return
        except Exception as exc:
            yield _sse_event(f"Failed to start simulation: {exc}", "error")
            yield _sse_event("done", "done")
            return

        yield _sse_event("Simulation complete.", "success")
        yield _sse_event("done", "done")

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000, threaded=True)
