from __future__ import annotations

from typing import Any, Dict, List, Literal, Tuple

import numpy as np
import pandas as pd

from profiles import CATEGORY_COLS


RecommenderName = Literal["popularity", "interests", "sustainability"]


def _effective_walking_tolerance(tourist: Dict[str, Any]) -> float:
    base = float(tourist["walking_tolerance"])
    mobility = str(tourist["mobility_mode"])
    if mobility == "transit":
        base += 0.20
    elif mobility == "mixed":
        base += 0.10
    return float(max(0.0, min(1.0, base)))


def _feasible_mask(tourist: Dict[str, Any], pois_df: pd.DataFrame) -> np.ndarray:
    budget = int(tourist["budget_level"])
    feasible = pois_df["price_level"].astype(int).values <= budget

    if bool(tourist["travel_with_kids"]):
        feasible = feasible & (pois_df["kid_friendly"].astype(int).values == 1)

    tol = _effective_walking_tolerance(tourist)
    feasible = feasible & (
        pois_df["walking_difficulty"].astype(float).values <= tol)

    return feasible


def interest_similarities(
    tourist: Dict[str, Any],
    pois_df: pd.DataFrame,
    *,
    popularity_weight: float = 0.9,
) -> np.ndarray:
    tourist_cat = np.asarray(tourist["interests"], dtype=float)
    mainstream = float(tourist.get("mainstream_tendency", 0.0))
    poi_cat = pois_df[CATEGORY_COLS].to_numpy(dtype=float)

    w_pop = popularity_weight * mainstream
    if w_pop <= 0.0:
        tourist_norm = np.linalg.norm(tourist_cat)
        poi_norms = np.linalg.norm(poi_cat, axis=1)
        denom = poi_norms * (tourist_norm if tourist_norm > 0 else 1.0)
        denom = np.where(denom == 0, 1.0, denom)
        return ((poi_cat @ tourist_cat) / denom).astype(float)

    pop = pois_df["popularity_rating"].astype(float).to_numpy() / 5.0
    tourist_feat = np.concatenate([tourist_cat, [w_pop]])
    poi_feat = np.column_stack([poi_cat, pop])

    tourist_norm = np.linalg.norm(tourist_feat)
    poi_norms = np.linalg.norm(poi_feat, axis=1)
    denom = poi_norms * (tourist_norm if tourist_norm > 0 else 1.0)
    denom = np.where(denom == 0, 1.0, denom)

    sims = (poi_feat @ tourist_feat) / denom
    return sims.astype(float)


def _sort_top_k(ids: np.ndarray, scores: np.ndarray, k: int) -> Tuple[List[int], List[float]]:
    idx = np.lexsort((ids, -scores))
    top_idx = idx[:k]
    top_ids = ids[top_idx].tolist()
    top_scores = scores[top_idx].tolist()
    return top_ids, top_scores


def recommend_popularity(
    tourist: Dict[str, Any],
    pois_df: pd.DataFrame,
    state: Dict[str, Any],
    k: int = 5,
) -> Dict[str, Any]:
    feasible = _feasible_mask(tourist, pois_df)
    df = pois_df.loc[feasible]

    ids = df["id"].astype(int).to_numpy()
    scores = df["popularity_rating"].astype(float).to_numpy()
    cand_ids, cand_scores = _sort_top_k(ids, scores, k=k)
    return {"candidate_ids": cand_ids, "candidate_scores": cand_scores}


def recommend_interests(
    tourist: Dict[str, Any],
    pois_df: pd.DataFrame,
    state: Dict[str, Any],
    k: int = 5,
) -> Dict[str, Any]:
    feasible = _feasible_mask(tourist, pois_df)
    df = pois_df.loc[feasible]

    ids = df["id"].astype(int).to_numpy()
    scores = interest_similarities(tourist, df)
    cand_ids, cand_scores = _sort_top_k(ids, scores, k=k)
    return {"candidate_ids": cand_ids, "candidate_scores": cand_scores}


def recommend_sustainability(
    tourist: Dict[str, Any],
    pois_df: pd.DataFrame,
    state: Dict[str, Any],
    k: int = 5,
) -> Dict[str, Any]:
    feasible = _feasible_mask(tourist, pois_df)
    df = pois_df.loc[feasible]

    ids = df["id"].astype(int).to_numpy()
    sims = interest_similarities(tourist, df)
    crowd_ratio = state["crowd_ratio_by_id"][ids]

    econ = df["neighborhood_economic_weight"].astype(float).to_numpy()
    econ_min = float(pois_df["neighborhood_economic_weight"].min())
    econ_max = float(pois_df["neighborhood_economic_weight"].max())
    if econ_max == econ_min:
        econ_scaled = np.zeros_like(econ)
    else:
        econ_scaled = (econ - econ_min) / (econ_max - econ_min)

    crowd_aversion = float(tourist["crowd_aversion"])
    sustain = float(tourist["sustainability_sensitivity"])

    w2 = 0.25 + 0.25 * crowd_aversion
    w3 = 0.10 + 0.35 * sustain
    w1 = max(0.05, 1.0 - (w2 + w3))
    w_sum = w1 + w2 + w3
    w1, w2, w3 = w1 / w_sum, w2 / w_sum, w3 / w_sum

    scores = w1 * sims + w2 * (1.0 - crowd_ratio) + w3 * econ_scaled
    cand_ids, cand_scores = _sort_top_k(ids, scores, k=k)
    return {"candidate_ids": cand_ids, "candidate_scores": cand_scores}


def recommend(
    recommender_name: RecommenderName,
    tourist: Dict[str, Any],
    pois_df: pd.DataFrame,
    state: Dict[str, Any],
    k: int = 5,
) -> Dict[str, Any]:
    if recommender_name == "popularity":
        return recommend_popularity(tourist, pois_df, state=state, k=k)
    if recommender_name == "interests":
        return recommend_interests(tourist, pois_df, state=state, k=k)
    if recommender_name == "sustainability":
        return recommend_sustainability(tourist, pois_df, state=state, k=k)
    raise ValueError(f"Unknown recommender: {recommender_name}")
