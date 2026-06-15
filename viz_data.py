from __future__ import annotations

import argparse
import json
import os
import sys

import pandas as pd

DEFAULT_ALGOS = ["popularity", "interests", "sustainability"]


def build_viz_data(
    results_dir: str,
    pois_csv: str,
    algos: list[str] | None = None,
) -> dict | None:
    pois_df = pd.read_csv(pois_csv).sort_values("id").reset_index(drop=True)
    if "lat" not in pois_df.columns or "lon" not in pois_df.columns:
        raise ValueError("pois.csv has no lat/lon columns.")

    pois = [
        {
            "id": int(r["id"]),
            "name": str(r["name"]),
            "neighborhood": str(r["neighborhood"]),
            "category": str(r["category"]),
            "lat": float(r["lat"]),
            "lon": float(r["lon"]),
        }
        for _, r in pois_df.iterrows()
    ]
    poi_ids = [p["id"] for p in pois]

    candidates = algos if algos is not None else DEFAULT_ALGOS
    series: dict = {}
    available_algos: list[str] = []
    n_ticks = 0

    for algo in candidates:
        ts_path = os.path.join(results_dir, f"{algo}_poi_crowding_timeseries.csv")
        if not os.path.exists(ts_path):
            continue

        ts = pd.read_csv(ts_path)
        ticks = sorted(ts["tick"].unique().tolist())
        n_ticks = max(n_ticks, len(ticks))

        algo_frames = []
        by_tick = dict(tuple(ts.groupby("tick")))
        for t in ticks:
            frame = by_tick[t].set_index("poi_id")
            row = [
                [
                    int(frame.loc[pid, "visitors"]),
                    round(float(frame.loc[pid, "crowd_ratio"]), 4),
                ]
                for pid in poi_ids
            ]
            algo_frames.append(row)

        series[algo] = algo_frames
        available_algos.append(algo)

    if not available_algos:
        return None

    return {
        "pois": pois,
        "algos": available_algos,
        "ticks": n_ticks,
        "series": series,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Print viz payload JSON from results CSVs")
    parser.add_argument("--results_dir", default="results")
    parser.add_argument("--pois_csv", default=os.path.join("data", "pois.csv"))
    parser.add_argument("--out", default=None, help="Optional output JSON file")
    args = parser.parse_args()

    try:
        payload = build_viz_data(args.results_dir, args.pois_csv)
    except ValueError as exc:
        sys.exit(str(exc))

    if payload is None:
        sys.exit(
            f"Error: no timeseries CSVs found in '{args.results_dir}'.\n"
            f"Run the experiment first:  python run_experiment.py --out_dir {args.results_dir}"
        )

    text = json.dumps(payload, separators=(",", ":"))
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
        size_kb = os.path.getsize(args.out) / 1024
        print(
            f"Wrote {args.out} ({size_kb:.0f} KB): "
            f"algos={payload['algos']}, ticks={payload['ticks']}, pois={len(payload['pois'])}"
        )
    else:
        print(text)


if __name__ == "__main__":
    main()
