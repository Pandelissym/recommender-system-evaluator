# Barcelona POI Recommender

Agent-based simulation that compares three POI recommendation strategies: popularity, interests, and sustainability using tourist agents moving through Barcelona points of interest.

## Demo of the system

A demo of the system can be found in [demo.mp4](demo.mp4)

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run the simulation from the terminal

From the project root, with the virtual environment activated:

```bash
python run_experiment.py
```

This runs all three recommenders and writes outputs to `results/`:

- `{algorithm}_visit_events.csv` — per-visit log
- `{algorithm}_poi_crowding_timeseries.csv` — crowd levels over time
- `{algorithm}_metrics.json` — evaluation metrics per algorithm
- `metrics_summary.json` — combined summary

Optional flags:

| Flag                | Default         | Description                    |
| ------------------- | --------------- | ------------------------------ |
| `--pois_csv_path`   | `data/pois.csv` | Path to the POI dataset        |
| `--population_size` | `3000`          | Number of tourist agents       |
| `--tick_limit`      | `36`            | Simulation length (ticks)      |
| `--profile_seed`    | `12345`         | Random seed for agent profiles |
| `--out_dir`         | `results`       | Output directory               |

Example:

```bash
python run_experiment.py --population_size 1000 --tick_limit 24 --out_dir results
```

## Run the web frontend

The UI lets you browse POI data, configure parameters, launch a simulation, and inspect results. It needs two processes: the Flask API and the Vite dev server.

Terminal 1: API server

```bash
source .venv/bin/activate
python server.py
```

The API listens on [http://127.0.0.1:5000](http://127.0.0.1:5000).

Terminal 2: frontend (`react-app/`):

```bash
cd react-app
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` requests to the Flask server on port 5000.

## Project layout

```
├── run_experiment.py   # CLI entry point for batch simulation
├── server.py           # Flask API used by the frontend
├── model.py            # Mesa agent-based simulation model
├── recommenders.py     # Recommendation algorithms
├── data/pois.csv       # Barcelona POI dataset
├── results/            # Simulation outputs (generated)
└── react-app/          # React frontend
```
