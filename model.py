from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd

import mesa
from mesa.datacollection import DataCollector

from agents import TouristAgent
from profiles import sample_tourist_profiles


class BarcelonaModel(mesa.Model):
    def __init__(
        self,
        *,
        pois_csv_path: str,
        population_size: int,
        recommender_name: str,
        profile_seed: int,
        tick_limit: int,
        capacity_scale: float = 5
    ):
        super().__init__()

        self.tick_limit = int(tick_limit)
        self.recommender_name = str(recommender_name)

        self.pois_df = pd.read_csv(pois_csv_path)
        self.pois_df["id"] = self.pois_df["id"].astype(int)
        self.pois_df["price_level"] = self.pois_df["price_level"].astype(int)
        self.pois_df["popularity_rating"] = self.pois_df["popularity_rating"].astype(
            float)

        self.pois_df["max_capacity"] = self.pois_df["max_capacity"].astype(
            float) / float(capacity_scale)
        self.pois_df["is_outdoor"] = self.pois_df["is_outdoor"].astype(int)
        self.pois_df["walking_difficulty"] = self.pois_df["walking_difficulty"].astype(
            float)
        self.pois_df["kid_friendly"] = self.pois_df["kid_friendly"].astype(int)
        self.pois_df["neighborhood_economic_weight"] = self.pois_df["neighborhood_economic_weight"].astype(
            float)

        self.poi_row_by_id = self.pois_df.set_index("id")
        self.poi_ids = self.pois_df["id"].to_numpy(dtype=int)
        self.max_id = int(self.poi_ids.max())

        self.poi_visitors_by_id = np.zeros(self.max_id + 1, dtype=int)
        self.max_capacity_by_id = np.zeros(self.max_id + 1, dtype=float)
        self.crowd_ratio_by_id = np.zeros(self.max_id + 1, dtype=float)

        for poi_id in self.poi_ids:
            self.max_capacity_by_id[poi_id] = float(
                self.poi_row_by_id.loc[int(poi_id), "max_capacity"])

        self.neighborhood_visit_counts: Dict[str, int] = {}
        for neigh in self.pois_df["neighborhood"].unique().tolist():
            self.neighborhood_visit_counts[str(neigh)] = 0

        self.visit_events: List[Dict[str, Any]] = []
        self.history_poi_visitors: List[np.ndarray] = []

        self.ticks: int = 0

        self.tourist_profiles = sample_tourist_profiles(
            n_tourists=population_size,
            seed=profile_seed,
            pois_df=self.pois_df,
        )
        self.tourist_agents: List[TouristAgent] = []
        for agent_index, profile in enumerate(self.tourist_profiles):
            agent = TouristAgent(
                model=self, profile=profile, agent_id=agent_index)
            self.tourist_agents.append(agent)

        self.datacollector = DataCollector(
            model_reporters={
                "tick": lambda m: m.ticks,
                "total_visitors": lambda m: int(np.sum(m.poi_visitors_by_id)),
                "overcrowded_pois_80": lambda m: int(np.sum(m.crowd_ratio_by_id[m.poi_ids] > 0.8)),
                "max_crowding_ratio": lambda m: float(np.max(m.crowd_ratio_by_id[m.poi_ids])),
                "mean_crowding_ratio": lambda m: float(np.mean(m.crowd_ratio_by_id[m.poi_ids])),
            }
        )

    def step(self) -> None:
        for agent in self.tourist_agents:
            agent.step()

        self.history_poi_visitors.append(
            self.poi_visitors_by_id[self.poi_ids].copy())

        self.datacollector.collect(self)
        self.ticks += 1
