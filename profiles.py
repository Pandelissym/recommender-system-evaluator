from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd


CATEGORIES: List[str] = ["Religious", "Art", "Nature", "Food", "History"]
CATEGORY_COLS: List[str] = ["cat_Religious",
                            "cat_Art", "cat_Nature", "cat_Food", "cat_History"]


@dataclass(frozen=True)
class TouristProfile:
    agent_index: int
    interests: List[float]
    mainstream_tendency: float
    budget_level: int
    mobility_mode: str
    walking_tolerance: float
    crowd_aversion: float
    sustainability_sensitivity: float
    outdoor_preference: float
    travel_with_kids: bool

    def as_dict(self) -> Dict[str, Any]:
        return {
            "agent_index": self.agent_index,
            "interests": list(self.interests),
            "mainstream_tendency": float(self.mainstream_tendency),
            "budget_level": self.budget_level,
            "mobility_mode": self.mobility_mode,
            "walking_tolerance": float(self.walking_tolerance),
            "crowd_aversion": float(self.crowd_aversion),
            "sustainability_sensitivity": float(self.sustainability_sensitivity),
            "outdoor_preference": float(self.outdoor_preference),
            "travel_with_kids": bool(self.travel_with_kids),
        }


def city_mainstream_interests(pois_df: pd.DataFrame) -> np.ndarray:
    pop = pois_df["popularity_rating"].astype(float).to_numpy()
    mat = pois_df[CATEGORY_COLS].to_numpy(dtype=float)
    vec = (mat * pop[:, None]).sum(axis=0)
    total = float(vec.sum())
    if total <= 0:
        return np.ones(len(CATEGORY_COLS), dtype=float) / float(len(CATEGORY_COLS))
    return (vec / total).astype(float)


def _sample_budget(rng: np.random.Generator) -> int:
    return int(rng.choice([1, 2, 3], p=[0.38, 0.44, 0.18]))


def _sample_mobility(rng: np.random.Generator) -> str:
    return str(rng.choice(["walk", "transit", "mixed"], p=[0.45, 0.25, 0.30]))


def _sample_interests(
    rng: np.random.Generator,
    mainstream_city: np.ndarray,
    *,
    dirichlet_alpha: np.ndarray,
    mainstream_beta_a: float = 2.0,
    mainstream_beta_b: float = 2.0,
) -> tuple[np.ndarray, float]:
    personal = rng.dirichlet(dirichlet_alpha).astype(float)
    mainstream_tendency = float(rng.beta(mainstream_beta_a, mainstream_beta_b))
    blended = (1.0 - mainstream_tendency) * personal + \
        mainstream_tendency * mainstream_city
    blended = blended / blended.sum()
    return blended, mainstream_tendency


def sample_tourist_profiles(
    n_tourists: int,
    seed: int,
    *,
    pois_df: Optional[pd.DataFrame] = None,
    pois_csv_path: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if pois_df is None:
        if pois_csv_path is None:
            mainstream_city = np.ones(
                len(CATEGORY_COLS), dtype=float) / float(len(CATEGORY_COLS))
        else:
            pois_df = pd.read_csv(pois_csv_path)
            mainstream_city = city_mainstream_interests(pois_df)
    else:
        mainstream_city = city_mainstream_interests(pois_df)

    rng = np.random.default_rng(seed)
    profiles: List[Dict[str, Any]] = []

    dirichlet_alpha = np.array([1.2, 1.0, 1.0, 1.0, 1.0], dtype=float)

    for agent_index in range(n_tourists):
        interests, mainstream_tendency = _sample_interests(
            rng, mainstream_city, dirichlet_alpha=dirichlet_alpha
        )

        profile = TouristProfile(
            agent_index=agent_index,
            interests=interests.tolist(),
            mainstream_tendency=mainstream_tendency,
            budget_level=_sample_budget(rng),
            mobility_mode=_sample_mobility(rng),
            walking_tolerance=float(rng.beta(2.0, 2.0)),
            crowd_aversion=float(rng.beta(1.6, 1.4)),
            sustainability_sensitivity=float(rng.beta(1.5, 1.5)),
            outdoor_preference=float(rng.beta(2.0, 2.0)),
            travel_with_kids=bool(rng.random() < 0.25),
        )
        profiles.append(profile.as_dict())

    return profiles
