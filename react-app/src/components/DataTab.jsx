import { useState, useEffect, useMemo } from "react";

const CATEGORY_BADGE = {
  Religious: "badge-purple",
  Art: "badge-blue",
  Nature: "badge-green",
  Food: "badge-amber",
  History: "badge-red",
};

const COLUMNS = [
  { key: "id", label: "#", numeric: true },
  { key: "name", label: "Name" },
  { key: "neighborhood", label: "Neighborhood" },
  { key: "category", label: "Category" },
  { key: "max_capacity", label: "Capacity", numeric: true },
  { key: "price_level", label: "Price", numeric: true },
  { key: "popularity_rating", label: "Popularity", numeric: true },
  { key: "is_outdoor", label: "Outdoor" },
  { key: "kid_friendly", label: "Kid OK" },
  { key: "walking_difficulty", label: "Walk Diff.", numeric: true },
];

export default function DataTab() {
  const [pois, setPois] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [neighborhood, setNeighborhood] = useState("All");
  const [category, setCategory] = useState("All");
  const [sortKey, setSortKey] = useState("id");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    fetch("/api/pois")
      .then((r) => r.json())
      .then((data) => {
        setPois(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const neighborhoods = useMemo(
    () => ["All", ...new Set(pois.map((p) => p.neighborhood))],
    [pois],
  );
  const categories = useMemo(
    () => ["All", ...new Set(pois.map((p) => p.category))],
    [pois],
  );

  const filtered = useMemo(() => {
    let rows = pois;
    if (search)
      rows = rows.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
      );
    if (neighborhood !== "All")
      rows = rows.filter((p) => p.neighborhood === neighborhood);
    if (category !== "All") rows = rows.filter((p) => p.category === category);
    return [...rows].sort((a, b) => {
      const av = a[sortKey],
        bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return sortAsc ? cmp : -cmp;
    });
  }, [pois, search, neighborhood, category, sortKey, sortAsc]);

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  if (loading)
    return (
      <div className="empty-state">
        <div className="spinner" />
        <span className="empty-title">Loading POI data…</span>
      </div>
    );

  if (error)
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <div className="empty-title">Could not reach backend</div>
        <div className="empty-desc">
          Make sure <code>server.py</code> is running on port 5000.
          <br />
          {error}
        </div>
      </div>
    );

  return (
    <div className="fade-in">
      <div className="section-header">
        <div>
          <div className="section-title">Barcelona Points of Interest</div>
          <div className="section-sub">
            {filtered.length} of {pois.length} POIs · from{" "}
            <code>data/pois.csv</code>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <input
          id="search-pois"
          type="text"
          className="filter-input"
          placeholder="🔍  Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          id="filter-neighborhood"
          className="filter-input"
          style={{ minWidth: 160 }}
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
        >
          {neighborhoods.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <select
          id="filter-category"
          className="filter-input"
          style={{ minWidth: 140 }}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={sortKey === col.key ? "sorted" : ""}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label} {sortKey === col.key ? (sortAsc ? "↑" : "↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((poi) => (
              <tr key={poi.id}>
                <td className="num">{poi.id}</td>
                <td
                  style={{
                    maxWidth: 240,
                    fontWeight: 500,
                    color: "var(--text)",
                  }}
                >
                  {poi.name}
                </td>
                <td>
                  <span className="badge badge-teal">{poi.neighborhood}</span>
                </td>
                <td>
                  <span
                    className={`badge ${CATEGORY_BADGE[poi.category] || "badge-blue"}`}
                  >
                    {poi.category}
                  </span>
                </td>
                <td className="num">{poi.max_capacity.toLocaleString()}</td>
                <td className="num">
                  {"💰".repeat(poi.price_level) || "Free"}
                </td>
                <td className="num">{"⭐".repeat(poi.popularity_rating)}</td>
                <td style={{ textAlign: "center" }}>
                  {poi.is_outdoor ? "🌿" : "🏛️"}
                </td>
                <td style={{ textAlign: "center" }}>
                  {poi.kid_friendly ? "✅" : "—"}
                </td>
                <td className="num">
                  {(poi.walking_difficulty * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
