# Freight Dispatch Lab

A local, deterministic freight dispatch simulation for exploring how simple planning policies affect fleet utilization, empty miles, contribution, and on-time delivery.

Freight Dispatch Lab creates a synthetic fleet and spot market, compares a rate-first baseline with a profit-aware heuristic, and lets a human review and approve work before simulated execution. It runs on Node.js with no third-party runtime dependencies.

> **Synthetic demo:** This is an independent educational simulation. It does not use or represent TrueMile's internal systems, data, architecture, or proprietary processes. Results are synthetic and do not establish real-world predictive performance.

## At a glance

- **Reproducible scenarios:** Generate 20 trucks and drivers, 100 freight offers, and seeded execution delays from a 32-bit seed.
- **Feasibility-aware planning:** Check equipment, capacity, endorsements, locations, pickup windows, delivery deadlines, driver hours, and overlapping trips.
- **Side-by-side comparison:** Evaluate both strategies against the exact same scenario.
- **Paired experiments:** Run 2–20 seeds (8 by default) and inspect averages, sample standard deviations, and paired strategy deltas.
- **Human approval gate:** Select a plan, review recommendations, approve assignments, and only then simulate pickups and deliveries.
- **Event history:** See approvals, departures, pickups, on-time deliveries, and delays in the scenario event log.
- **Local-first runtime:** The app binds to `127.0.0.1`; it does not contact brokers, drivers, map providers, payment systems, or external AI services.

## Quick start

**Requirements:** Node.js 22 or later.

```bash
node --version
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). No `npm install` step is needed because the project uses only Node.js built-in modules.

To use another port:

```powershell
$env:PORT = "4400"
npm start
```

Then open [http://127.0.0.1:4400](http://127.0.0.1:4400).

## Try the dispatch workflow

1. Create a scenario with a seed. The same seed recreates the same fleet, offers, and delays.
2. Compare the rate-first and profit-aware plans.
3. Run the paired seed report to see how the policies compare across multiple generated scenarios.
4. Select a plan and review its recommendations.
5. Select pending assignments and approve them. Simulation remains unavailable until work is approved.
6. Simulate approved assignments and inspect the resulting delivery statuses and event history.

All scenario state lives in the server's memory and is cleared when the server stops. The browser remembers the current scenario ID in local storage only for reloads during that server session.

## Planning strategies

Both strategies use the same deterministic feasibility checks and simulated inputs:

| Strategy | Selection rule |
| --- | --- |
| **Rate-first baseline** | Sort offers by rate, then pickup-window start, and choose the first feasible truck–driver pair. |
| **Profit-aware heuristic** | Consider feasible assignments near the earliest pickup, then rank by expected contribution per driving hour with a deadhead-mile penalty. |

The profit-aware score is a transparent heuristic, not an exact optimizer. It is useful for comparing behavior in this demo, but it does not prove that the policy is globally optimal or commercially superior.

## Reported metrics

The dashboard and experiment report include:

- Loads accepted and acceptance rate
- Revenue, variable cost, and contribution
- Empty miles, loaded miles, and empty-mile ratio
- Revenue and contribution per truck-day
- Truck utilization, measured as planned driving hours divided by available 14-hour operating hours
- On-time delivery rate and constraint violations
- For multi-seed reports: mean, sample standard deviation, and paired profit-aware-minus-baseline delta

Each seed in a paired experiment generates one scenario that both strategies evaluate. This keeps the comparison paired instead of comparing results from unrelated markets. Experiment seeds advance by 104,729; the requested count can range from 2 to 20.

## Model assumptions

These are configurable simulation assumptions, not verified operating data:

| Input | Value |
| --- | ---: |
| Scenario horizon | 5 simulated days |
| Road distance | Great-circle distance × 1.22 |
| Average speed | 52 mph |
| Variable cost | $1.70 per mile, for loaded and empty miles |
| Pickup handling | 0.5 hours |
| Driving limit | 11 hours per shift |
| Shift limit | 14 hours |
| Required rest | 10 hours between trips |

The generated loads also include synthetic equipment requirements, weights, qualifications, offered rates, pickup windows, delivery deadlines, and seeded execution delays. Distances are estimates; they do not include live roads, traffic, weather, or routing restrictions.

## API

The local server exposes a small JSON API. Replace `SCENARIO_ID` with the `id` returned by `POST /api/scenarios`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/scenarios` | Create a seeded scenario; body: `{ "seed": 42 }` |
| `POST` | `/api/experiments` | Run paired seeds; body: `{ "seed": 42, "count": 8 }` |
| `GET` | `/api/scenarios/:id` | Read current scenario and workflow state |
| `POST` | `/api/scenarios/:id/compare` | Calculate both plans; body: `{}` |
| `POST` | `/api/scenarios/:id/dispatch` | Select `baseline` or `profit-aware` for review |
| `POST` | `/api/scenarios/:id/approve` | Approve assignment IDs for simulation |
| `POST` | `/api/scenarios/:id/simulate` | Simulate previously approved assignments; body: `{}` |

Example using `curl`:

```bash
curl -X POST http://127.0.0.1:4173/api/scenarios \
  -H "content-type: application/json" \
  -d '{"seed":42}'
```

The service binds to `127.0.0.1` by default. Scenario state is in-memory and clears when the process stops.

## Development

Run the built-in Node.js test suite:

```bash
npm test
```

The tests use Node's built-in test runner and cover deterministic generation, feasibility constraints, strategy metrics, paired experiments, approval gating, execution events, and HTTP routes.

### Project structure

```text
public/       Browser dashboard assets
src/          Scenario generation, planning, metrics, execution, and store
tests/        Node built-in unit and HTTP integration tests
docs/         Design, implementation plan, and handover notes
server.mjs    Local HTTP server and JSON API
```

## Known limitations

- The planner is a deterministic greedy heuristic, not an exact solver or OR-Tools model.
- The generated fleet, offers, delays, and performance results are synthetic.
- Distances and travel times are approximate and do not use live routing or conditions.
- The server has no persistent database, authentication, or multi-user coordination.
- This prototype is not a production dispatch, safety, compliance, or financial decision system.

See [the handover notes](docs/handover.md), [the design](docs/superpowers/specs/2026-11-16-freight-dispatch-dashboard-design.md), and [the implementation plan](docs/superpowers/plans/2026-11-16-freight-dispatch-dashboard.md) for additional context.
