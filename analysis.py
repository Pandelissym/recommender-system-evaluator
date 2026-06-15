from __future__ import annotations
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

import json
import os
from typing import Dict, List

import matplotlib

matplotlib.use("Agg")


ALGORITHMS: List[str] = ["popularity", "interests", "sustainability"]


if "MPLCONFIGDIR" not in os.environ:
    os.environ["MPLCONFIGDIR"] = os.path.join(
        os.path.dirname(__file__), ".mplcache")


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def generate_figures(results_dir: str = "results_final", figures_dir: str | None = None) -> None:
    if figures_dir is None:
        figures_dir = os.path.join(results_dir, "figures")
    _ensure_dir(figures_dir)

    summary_path = os.path.join(results_dir, "metrics_summary.json")
    with open(summary_path, "r", encoding="utf-8") as f:
        summary: Dict[str, Dict] = json.load(f)

    pois_df = pd.read_csv(os.path.join("data", "pois.csv"))
    pois_df["id"] = pois_df["id"].astype(int)
    id_to_name = {int(r["id"]): str(r["name"]) for _, r in pois_df.iterrows()}
    id_to_neigh = {int(r["id"]): str(r["neighborhood"])
                   for _, r in pois_df.iterrows()}

    hotspot_ids = [1, 2, 3]  # Sagrada Familia, Parc Guell, La Rambla
    plt.figure(figsize=(11, 6))
    for algo in ALGORITHMS:
        ts_path = os.path.join(
            results_dir, f"{algo}_poi_crowding_timeseries.csv")
        ts = pd.read_csv(ts_path)
        for hid in hotspot_ids:
            line = ts.loc[ts["poi_id"].astype(int) == hid].sort_values("tick")
            plt.plot(
                line["tick"].to_numpy(),
                line["crowd_ratio"].to_numpy(),
                label=f"{algo}:{id_to_name.get(hid, str(hid))}",
            )
    plt.axhline(0.8, color="black", linestyle="--",
                linewidth=1, label="80% capacity")
    plt.title("Crowding ratio over time (hotspots)")
    plt.xlabel("Tick")
    plt.ylabel("Current visitors / max capacity")
    plt.legend(fontsize=8, ncols=2)
    plt.tight_layout()
    plt.savefig(os.path.join(
        figures_dir, "hotspots_crowding_lines.png"), dpi=200)
    plt.close()

    peak_matrix = []
    poi_ids = pois_df["id"].astype(int).to_numpy()
    for algo in ALGORITHMS:
        peak_map = summary[algo]["peak_crowding_ratio_by_poi"]
        peak_row = [float(peak_map.get(str(pid), 0.0))
                    for pid in poi_ids.tolist()]
        peak_matrix.append(peak_row)
    peak_matrix = np.asarray(peak_matrix, dtype=float)  # (3, n_pois)

    plt.figure(figsize=(14, 4))
    plt.imshow(peak_matrix, aspect="auto", interpolation="nearest")
    plt.colorbar(label="Peak crowding ratio")
    plt.yticks(np.arange(len(ALGORITHMS)), ALGORITHMS)
    plt.xticks(np.arange(len(poi_ids)), [str(pid)
               for pid in poi_ids], rotation=90, fontsize=6)
    plt.title("Peak congestion heatmap (POI id axis)")
    plt.tight_layout()
    plt.savefig(os.path.join(
        figures_dir, "peak_congestion_heatmap.png"), dpi=200)
    plt.close()

    plt.figure(figsize=(12, 6))
    neigh_order = (
        pois_df[["neighborhood"]].drop_duplicates().sort_values("neighborhood")[
            "neighborhood"].tolist()
    )
    for algo in ALGORITHMS:
        ev_path = os.path.join(results_dir, f"{algo}_visit_events.csv")
        ev = pd.read_csv(ev_path)
        if "chosen_neighborhood" not in ev.columns:
            raise ValueError(f"Missing chosen_neighborhood in {ev_path}")
        counts = ev.groupby("chosen_neighborhood").size().reindex(
            neigh_order, fill_value=0)
        plt.plot(neigh_order, counts.to_numpy(),
                 marker="o", linewidth=1, label=algo)

    plt.xticks(rotation=90, fontsize=8)
    plt.ylabel("Number of visits (arrivals)")
    plt.title("Neighborhood visit distribution (arrivals)")
    plt.legend()
    plt.tight_layout()
    plt.savefig(os.path.join(
        figures_dir, "neighborhood_visit_distribution.png"), dpi=200)
    plt.close()

    summary_rows = []
    for algo in ALGORITHMS:
        row = summary[algo]
        summary_rows.append(
            {
                "recommender": algo,
                "overcrowding_events_total": row["spatial_overcrowding_events_total"],
                "peak_crowding_ratio_max": row["spatial_peak_crowding_ratio_max"],
                "neighborhood_gini": row["neighborhood_gini"],
                "precision_at_5": row["precision_at_5"],
                "recall_at_5": row["recall_at_5"],
                "diversity_visited_share": row["diversity_visited_share"],
                "fairness_mean_abs_disparity": row["fairness_mean_abs_disparity"],
                "trust_share_interest_ge_median": row["trust_share_interest_ge_median"],
                "interest_match_mean": row["interest_match_mean"],
            }
        )
    df_summary = pd.DataFrame(summary_rows)

    plt.figure(figsize=(12, 4))
    plt.axis("off")
    table = plt.table(
        cellText=df_summary.round(4).values,
        colLabels=df_summary.columns.tolist(),
        loc="center",
        cellLoc="center",
    )
    table.auto_set_font_size(False)
    table.set_fontsize(8)
    plt.title("Recommender comparison metrics (from simulation)")
    plt.tight_layout()
    plt.savefig(os.path.join(
        figures_dir, "metrics_summary_table.png"), dpi=200)
    plt.close()

    print(f"Figures written to: {figures_dir}")


if __name__ == "__main__":
    generate_figures()
