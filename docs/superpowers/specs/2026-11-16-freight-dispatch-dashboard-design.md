# Freight Dispatch Dashboard MVP Design

## Intent

Build a portfolio-ready local simulation of a small freight operation. A dispatcher can generate a reproducible synthetic fleet and freight market, compare a rate-first baseline with a profit-aware plan, review explanations, approve assignments, simulate execution, and inspect operating outcomes.

## Goals

- Generate 20 trucks, 20 paired drivers, and 100 freight offers from a user-selected seed.
- Enforce equipment, weight, availability, pickup-window, delivery-deadline, and driver-hours constraints in deterministic code.
- Compare two strategies on the exact same scenario and report economics, miles, utilization, delivery performance, acceptance, and violations.
- Report averages and sample variability across multiple paired synthetic seeds so one scenario does not stand in for the system.
- Keep approval between recommendations and simulated execution; record state changes as auditable events.
- Make the system runnable locally without external services or installed project dependencies.

## Non-goals

- Real freight ingestion, driver or broker messaging, dispatch commitments, or payments.
- Production routing, traffic, weather, HOS compliance, database persistence, deployed multi-user access, LLM agents, or predictive ML.
- Claims of real-world performance from synthetic scenarios.

## Approaches considered

1. **Python + Streamlit.** Closest to the proposed candidate stack and fast for a data-heavy prototype. Python is not installed in the current environment, and a browser dashboard is a better fit for the requested product direction.
2. **React + FastAPI.** A familiar portfolio stack with clear service boundaries, but it requires package installation and a Python runtime that are not available here.
3. **Node.js built-in HTTP server + browser ES modules (chosen).** Node 22 is available, and this approach needs no third-party packages or network access. It supports a real local API, deterministic domain modules, a polished interactive dashboard, and built-in tests while leaving room to replace the storage and UI layers later.

## Architecture

The Node server serves the static dashboard and JSON API. Domain modules generate seeded scenarios, evaluate feasible assignments, compare dispatch strategies, calculate metrics, and apply approved execution events. The server keeps scenario state in memory for one local session; the browser remembers the current scenario ID so refreshes can reload it while the server is running. The frontend uses native HTML, CSS, SVG, and ES modules.

The baseline processes offers by offered rate and selects the first feasible truck-driver pair. The proposed planner is a deterministic profit-aware heuristic: it repeatedly selects the feasible load/resource option with the strongest expected contribution per occupied hour, accounting for deadhead cost. It is not an exact solver; the UI and documentation will say so.

## Assumptions

- Synthetic locations are US cities with coordinates. Road miles are approximated as great-circle distance multiplied by 1.22.
- Average speed is 52 mph; handling time is 0.5 hours; vehicle cost is $1.70 per mile.
- Each driver may drive up to 11 hours in a 14-hour shift and requires a 10-hour rest before the next shift. These are simplified simulation limits, not a compliance engine.
- A load is feasible only when capacity, equipment, pickup window, delivery deadline, route duration, and driver limits all pass deterministic checks.
- Execution delay is seeded and synthetic. No real routes, rates, locations, or carrier data are used.

## User flow

1. Choose a seed and generate a scenario.
2. Run both dispatch strategies and compare their predicted metrics and lane plans.
3. Optionally run an eight-seed paired evaluation and inspect mean and sample standard deviation for each strategy and their per-seed difference.
4. Select one strategy, inspect recommended assignments and reasons, and approve selected assignments.
5. Simulate approved trips. Loads, trucks, drivers, and the event log update, and actual on-time outcomes and contribution are reported.

## Reliability and truthfulness

- Reject malformed API requests with clear errors and a non-success HTTP status.
- Validate the selected plan before approval and prevent duplicate assignment or duplicate simulation.
- Keep constraints and calculations deterministic; never delegate arithmetic or feasibility to an LLM.
- Label all generated data, road-mile estimates, cost inputs, dispatch rules, and execution delays as assumptions.
- Keep the approval gate before any simulated execution action.

## Decisions left to the builder

- Exact visual styling, responsive layout, and dashboard information hierarchy.
- Accessible labels, keyboard operation, table pagination, and empty/loading/error states.
- API route shape and event payloads, provided the contracts above are preserved.
