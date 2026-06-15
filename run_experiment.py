from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict, List

import numpy as np
import pandas as pd

from metrics import evaluate_run
from model import BarcelonaModel


def export_timeseries(model: Any, *, out_path: str) -> None:
    if len(model.history_poi_visitors) == 0:
        return

    visitors_time = np.stack(model.history_poi_visitors, axis=0)
    T, n = visitors_time.shape
    poi_ids = model.poi_ids.astype(int)
    caps = model.max_capacity_by_id[poi_ids].astype(float)
    caps = np.where(caps == 0, 1.0, caps)

    crowd_ratio_time = visitors_time / caps[None, :]

    flat_visitors = visitors_time.reshape(-1)
    flat_ratio = crowd_ratio_time.reshape(-1)

    df = pd.DataFrame(
        {
            "tick": np.repeat(np.arange(T, dtype=int), n),
            "poi_id": np.tile(poi_ids, T),
            "visitors": flat_visitors.astype(int),
            "crowd_ratio": flat_ratio.astype(float),
        }
    )

    poi_meta = model.pois_df[["id", "name", "neighborhood", "category"]].copy()
    poi_meta["id"] = poi_meta["id"].astype(int)

    df = df.merge(poi_meta, how="left", left_on="poi_id", right_on="id")
    df = df.drop(columns=["id"])
    df.to_csv(out_path, index=False)


def run_one(
    *,
    pois_csv_path: str,
    population_size: int,
    tick_limit: int,
    recommender_name: str,
    profile_seed: int,
    out_dir: str,
) -> Dict[str, Any]:
    model = BarcelonaModel(
        pois_csv_path=pois_csv_path,
        population_size=population_size,
        recommender_name=recommender_name,
        profile_seed=profile_seed,
        tick_limit=tick_limit,
    )

    for _ in range(tick_limit):
        model.step()

    metrics = evaluate_run(model)

    visit_events_path = os.path.join(out_dir, f"{recommender_name}_visit_events.csv")
    pd.DataFrame(model.visit_events).to_csv(visit_events_path, index=False)

    timeseries_path = os.path.join(out_dir, f"{recommender_name}_poi_crowding_timeseries.csv")
    export_timeseries(model, out_path=timeseries_path)

    metrics_path = os.path.join(out_dir, f"{recommender_name}_metrics.json")
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pois_csv_path", type=str, default="data/pois.csv")
    parser.add_argument("--population_size", type=int, default=3000)
    parser.add_argument("--tick_limit", type=int, default=36)
    parser.add_argument("--profile_seed", type=int, default=12345)
    parser.add_argument("--out_dir", type=str, default="results")
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)

    algorithms: List[str] = ["popularity", "interests", "sustainability"]
    metrics_by_algo: Dict[str, Any] = {}

    for algo in algorithms:
        print(f"Running recommender={algo} ...")
        metrics_by_algo[algo] = run_one(
            pois_csv_path=args.pois_csv_path,
            population_size=args.population_size,
            tick_limit=args.tick_limit,
            recommender_name=algo,
            profile_seed=args.profile_seed,
            out_dir=args.out_dir,
        )

    summary_path = os.path.join(args.out_dir, "metrics_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(metrics_by_algo, f, indent=2)


if __name__ == "__main__":
    main()

