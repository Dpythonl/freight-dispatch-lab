# Freight Dispatch Lab — Current Handover

**Project status:** Runnable local deterministic dashboard MVP.
**Last updated:** 2026-11-16

## Purpose

This is an independent portfolio simulation inspired by freight dispatch operations. It does not use or imply access to TrueMile internal systems, data, architecture, or proprietary processes.

## Implemented

- Deterministic synthetic scenario generator for 20 trucks, 20 paired drivers, and 100 loads.
- Stable IDs, locations, equipment, capacities, endorsements, offers, pickup and delivery windows, and seeded execution delays.
- Hard checks for equipment, capacity, driver qualifications, co-location, pickup time, delivery deadline, driving hours, shift duration, horizon, and schedule overlap.
- Rate-first greedy baseline and profit-aware deterministic heuristic, evaluated on the same seed and fleet state.
- Operational metrics for empty and loaded miles, utilization, revenue, contribution, on-time delivery, acceptance, cost per mile, and violations.
- Eight-seed paired experiment report with mean and sample standard deviation for strategy outcomes.
- Approval-gated execution simulation with state transitions and event history.
- Responsive local dashboard with lane visualization, comparison table, dispatch queue, approval controls, load board, fleet board, and visible assumptions.
- Node 22 built-in tests; no third-party dependencies.

## Current decisions

- Node.js 22 built-in HTTP server and native browser modules were used because Node was available in the workspace and Python was not.
- Scenario state is held in memory and is cleared on server restart.
- Great-circle miles are multiplied by 1.22 to estimate road distance; the map displays these estimated lanes without live routing.
- Profit-aware planning is a heuristic. It prioritizes near-term feasible work by estimated contribution per driving hour and penalizes empty miles; it is not an exact optimization solver.
- The scenario assumes 52 mph, $1.70 per mile, 0.5 hours for handling, 11 driving hours per 14-hour shift, and 10 hours of rest.
- A seeded synthetic delay affects simulated on-time delivery; no real communications or commitments occur.
- The experiment report defaults to eight paired seeds derived from the user-selected base seed.

## Not implemented

- OR-Tools or another exact VRP solver.
- LangGraph or deployed LLM agents.
- PostgreSQL/PostGIS, multi-user concurrency, or persistent storage.
- Live routing, traffic, weather, broker offers, driver updates, or external commitments.
- XGBoost, trained predictive models, or claims of real-world performance.

## Run and verify

- Start: `npm start`
- Open: `http://127.0.0.1:4173`
- Test: `npm test`

See [README.md](../README.md) for API routes, assumptions, and usage.

## Suggested next increments

1. Replace the heuristic with a solver-backed planner while retaining the same feasibility validator and baseline.
2. Persist scenarios and events in a transactional database before adding concurrent dispatch workflows.
3. Add real routing estimates with a documented provider and data-licensing decision.
4. Add agent coordination and predictive ML only after deterministic tools and evaluation data are established.
