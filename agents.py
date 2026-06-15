from __future__ import annotations

from typing import Any, Dict, Optional

import mesa

from recommenders import RecommenderName, recommend


class TouristAgent(mesa.Agent):
    def __init__(self, model: "BarcelonaModel", profile: Dict[str, Any], agent_id: int):
        super().__init__(model)
        self.profile = profile
        self.agent_id = int(agent_id)

        self.current_poi_id: Optional[int] = None
        self.dwell_remaining: int = 0

    def _sample_dwell_ticks(self, poi_is_outdoor: int) -> int:
        outdoor_factor = 1 if (
            poi_is_outdoor == 1 and self.profile["outdoor_preference"] >= 0.55) else 0
        kids_factor = 1 if bool(self.profile["travel_with_kids"]) else 0
        crowd_factor = 1 if self.profile["crowd_aversion"] >= 0.7 else 0
        base = 2 + 2 * outdoor_factor + 1 * kids_factor - 1 * crowd_factor
        return int(max(1, min(6, base)))

    def step(self) -> None:
        if self.current_poi_id is not None and self.dwell_remaining > 0:
            self.dwell_remaining -= 1
            if self.dwell_remaining == 0:
                self.model.poi_visitors_by_id[self.current_poi_id] -= 1
                poi_id = self.current_poi_id
                cap = self.model.max_capacity_by_id[poi_id]
                self.model.crowd_ratio_by_id[poi_id] = float(
                    self.model.poi_visitors_by_id[poi_id]) / float(cap)
                self.current_poi_id = None
            return

        rec_name: RecommenderName = self.model.recommender_name
        rec_result = recommend(
            rec_name,
            tourist=self.profile,
            pois_df=self.model.pois_df,
            state={"crowd_ratio_by_id": self.model.crowd_ratio_by_id},
            k=5,
        )

        cand_ids = rec_result["candidate_ids"]
        cand_scores = rec_result["candidate_scores"]

        if len(cand_ids) == 0:
            return

        chosen_id = int(cand_ids[0])
        chosen_score = float(cand_scores[0])

        self.model.poi_visitors_by_id[chosen_id] += 1
        cap = self.model.max_capacity_by_id[chosen_id]
        self.model.crowd_ratio_by_id[chosen_id] = float(
            self.model.poi_visitors_by_id[chosen_id]) / float(cap)

        poi_row = self.model.poi_row_by_id.loc[chosen_id]
        poi_neigh = str(poi_row["neighborhood"])
        self.model.neighborhood_visit_counts[poi_neigh] = self.model.neighborhood_visit_counts.get(
            poi_neigh, 0) + 1

        self.current_poi_id = chosen_id
        self.dwell_remaining = self._sample_dwell_ticks(
            int(poi_row["is_outdoor"]))

        self.model.visit_events.append(
            {
                "tick": self.model.ticks,
                "agent_id": int(self.agent_id),
                "recommender": self.model.recommender_name,
                "chosen_poi_id": chosen_id,
                "chosen_poi_name": str(poi_row["name"]),
                "chosen_neighborhood": poi_neigh,
                "chosen_score": chosen_score,
                "candidate_poi_ids": cand_ids,
            }
        )
