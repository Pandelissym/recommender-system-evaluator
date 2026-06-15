from __future__ import annotations

from typing import Any, Dict, List, Set, Tuple

import numpy as np
import pandas as pd

from recommenders import interest_similarities


def gini(values: List[float]) -> float:
    arr = np.asarray(values, dtype=float)
    if arr.size == 0:
        return 0.0
    if np.all(arr == 0):
        return 0.0

    arr = np.sort(arr)
    n = arr.size
    cum = np.cumsum(arr)
    return float((n + 1 - 2 * np.sum(cum) / cum[-1]) / n)


def _effective_walking_tolerance(profile: Dict[str, Any]) -> float:
    base = float(profile["walking_tolerance"])
    mobility = str(profile["mobility_mode"])
    if mobility == "transit":
        base += 0.20
    elif mobility == "mixed":
        base += 0.10
    return float(max(0.0, min(1.0, base)))


def _feasible_pois(profile: Dict[str, Any], pois_df: pd.DataFrame) -> np.ndarray:
    budget = int(profile["budget_level"])
    feasible = pois_df["price_level"].astype(int).values <= budget

    if bool(profile["travel_with_kids"]):
        feasible = feasible & (pois_df["kid_friendly"].astype(int).values == 1)

    tol = _effective_walking_tolerance(profile)
    feasible = feasible & (pois_df["walking_difficulty"].astype(float).values <= tol)

    return feasible


def evaluate_run(model: Any) -> Dict[str, Any]:
    pois_df: pd.DataFrame = model.pois_df
    poi_ids = model.poi_ids

    if len(model.history_poi_visitors) > 0:
        visitors_time = np.stack(model.history_poi_visitors, axis=0)  
        caps = model.max_capacity_by_id[poi_ids].astype(float)
        caps = np.where(caps == 0, 1.0, caps)
        crowd_ratio_time = visitors_time / caps[None, :]

        overcrowding_mask = crowd_ratio_time > 0.8
        overcrowding_events_total = int(np.sum(overcrowding_mask))
        overcrowding_events_per_poi = overcrowding_mask.sum(axis=0).astype(int)
        peak_crowding_ratio_by_poi = crowd_ratio_time.max(axis=0)
        peak_crowding_ratio_max = float(np.max(peak_crowding_ratio_by_poi))
    else:
        overcrowding_events_total = 0
        overcrowding_events_per_poi = np.zeros_like(poi_ids, dtype=int)
        peak_crowding_ratio_by_poi = np.zeros_like(poi_ids, dtype=float)
        peak_crowding_ratio_max = 0.0

    neighborhood_counts = [model.neighborhood_visit_counts[str(n)] for n in model.neighborhood_visit_counts.keys()]
    neighborhood_gini = gini(neighborhood_counts)

    top10_pop_ids = (
        pois_df.sort_values("popularity_rating", ascending=False)["id"].astype(int).head(10).to_numpy()
    )
    visit_events = model.visit_events
    total_visits = len(visit_events)
    if total_visits > 0:
        visits_top10 = sum(1 for ev in visit_events if int(ev["chosen_poi_id"]) in set(top10_pop_ids.tolist()))
        top10_popular_share = float(visits_top10) / float(total_visits)
    else:
        top10_popular_share = 0.0

    relevant_sets_by_agent: Dict[int, Set[int]] = {}
    median_threshold_by_agent: Dict[int, float] = {}
    interest_score_by_agent_and_id: Dict[int, Dict[int, float]] = {}

    pois_by_id = pois_df.set_index("id")

    for agent_id_str, profile in enumerate(model.tourist_profiles):
        agent_id = int(agent_id_str)
        feasible_mask = _feasible_pois(profile, pois_df)

        feasible_ids = pois_df.loc[feasible_mask, "id"].astype(int).to_numpy()
        if feasible_ids.size == 0:
            relevant_sets_by_agent[agent_id] = set()
            median_threshold_by_agent[agent_id] = float("-inf")
            interest_score_by_agent_and_id[agent_id] = {}
            continue

        sims = interest_similarities(profile, pois_df.loc[feasible_mask])
        score_by_id = {int(pid): float(s) for pid, s in zip(feasible_ids.tolist(), sims.tolist())}

        score_vals = np.asarray(list(score_by_id.values()), dtype=float)
        q75 = float(np.quantile(score_vals, 0.75))
        median = float(np.quantile(score_vals, 0.50))

        relevant_ids = {pid for pid, s in score_by_id.items() if s >= q75}

        relevant_sets_by_agent[agent_id] = relevant_ids
        median_threshold_by_agent[agent_id] = median
        interest_score_by_agent_and_id[agent_id] = score_by_id

    precision_sum = 0.0
    recall_sum = 0.0
    trust_sum = 0.0
    interest_match_sum = 0.0
    event_count = 0

    unique_visited: Set[int] = set()
    unique_recommended: Set[int] = set()

    for ev in visit_events:
        agent_id = int(ev["agent_id"])
        chosen_id = int(ev["chosen_poi_id"])
        candidate_ids = [int(x) for x in ev["candidate_poi_ids"]]

        unique_visited.add(chosen_id)
        unique_recommended.update(candidate_ids)

        relevant = relevant_sets_by_agent.get(agent_id, set())
        if len(relevant) == 0:
            continue

        intersection = relevant.intersection(candidate_ids)
        precision_sum += float(len(intersection)) / float(5)
        recall_sum += float(len(intersection)) / float(len(relevant))

        chosen_interest = interest_score_by_agent_and_id.get(agent_id, {}).get(chosen_id, float("nan"))
        if not np.isnan(chosen_interest):
            interest_match_sum += float(chosen_interest)
            if chosen_interest >= median_threshold_by_agent.get(agent_id, float("inf")):
                trust_sum += 1.0

        event_count += 1

    if event_count > 0:
        precision_at_5 = float(precision_sum) / float(event_count)
        recall_at_5 = float(recall_sum) / float(event_count)
        trust_share = float(trust_sum) / float(event_count)
        interest_match_mean = float(interest_match_sum) / float(event_count)
    else:
        precision_at_5 = 0.0
        recall_at_5 = 0.0
        trust_share = 0.0
        interest_match_mean = 0.0

    diversity_visited_share = float(len(unique_visited)) / float(len(pois_df))
    diversity_recommended_share = float(len(unique_recommended)) / float(len(pois_df))

    if len(model.neighborhood_visit_counts) > 0 and total_visits > 0:
        neigh_actual = np.array(
            [model.neighborhood_visit_counts[str(n)] for n in model.neighborhood_visit_counts.keys()], dtype=float
        )
        neigh_actual_share = neigh_actual / float(total_visits)

        pois_df = pois_df.copy()
        pois_df["neighborhood"] = pois_df["neighborhood"].astype(str)
        neigh_weight = (
            pois_df.groupby("neighborhood")["neighborhood_economic_weight"].mean().reindex(model.neighborhood_visit_counts.keys())
        )
        neigh_weight = neigh_weight.fillna(neigh_weight.mean() if neigh_weight.notna().any() else 1.0).to_numpy(dtype=float)
        neigh_expected_share = neigh_weight / float(np.sum(neigh_weight) if np.sum(neigh_weight) > 0 else 1.0)

        disparity = np.abs(neigh_actual_share - neigh_expected_share)
        fairness_mean_abs_disparity = float(np.mean(disparity))
        fairness_max_disparity = float(np.max(disparity))
    else:
        fairness_mean_abs_disparity = 0.0
        fairness_max_disparity = 0.0

    return {
        "recommender_name": getattr(model, "recommender_name", None),
        "population_size": int(len(model.tourist_profiles)),
        "tick_limit": int(getattr(model, "tick_limit", 0)),
        "spatial_overcrowding_events_total": overcrowding_events_total,
        "spatial_peak_crowding_ratio_max": peak_crowding_ratio_max,
        "neighborhood_gini": float(neighborhood_gini),
        "top10_popular_share": float(top10_popular_share),
        "precision_at_5": float(precision_at_5),
        "recall_at_5": float(recall_at_5),
        "diversity_visited_share": float(diversity_visited_share),
        "diversity_recommended_share": float(diversity_recommended_share),
        "fairness_mean_abs_disparity": float(fairness_mean_abs_disparity),
        "fairness_max_disparity": float(fairness_max_disparity),
        "trust_share_interest_ge_median": float(trust_share),
        "interest_match_mean": float(interest_match_mean),
        "peak_crowding_ratio_by_poi": {
            str(int(poi_id)): float(peak_crowding_ratio_by_poi[i]) for i, poi_id in enumerate(poi_ids.tolist())
        },
    }

