# Freight Dispatch Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local, dependency-free freight dispatch simulation dashboard with deterministic recommendations, approval, execution, and strategy metrics.

**Architecture:** Node 22 serves static browser assets and a JSON API. Pure domain modules own seeded data, feasibility, planning, metrics, and event transitions; the frontend calls the API and renders the selected scenario.

**Tech Stack:** Node.js 22 built-in HTTP server, ECMAScript modules, HTML/CSS/SVG, Node built-in `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-16-freight-dispatch-dashboard-design.md`

## Global Constraints

- Use 20 trucks, 20 paired drivers, and 100 synthetic offers by default.
- Road miles are great-circle distance multiplied by 1.22; average speed is 52 mph.
- Handling time is 0.5 hours; variable cost is $1.70 per mile.
- Driver limits are 11 driving hours per 14-hour shift with 10 hours rest before the next shift.
- Every assigned load must satisfy capacity, equipment, availability, pickup, delivery, and driver-hours constraints.
- Require human approval before simulated execution; record state transitions and prevent duplicate booking.
- Synthetic results are not evidence of real-world predictive performance.
- No external runtime dependencies, APIs, or data services.

## Review Focus

- Invalid or extreme seeds and malformed request JSON must return useful errors without crashing the server.
- A load cannot appear twice in one plan or be approved twice into a duplicate booking.
- Truck and driver reservations must not overlap when sequential loads are scheduled.
- Loads with incompatible equipment, excess weight, late pickup, late delivery, or excess driver hours must be rejected.
- Repeating a seed must produce the same scenario and strategy outputs; running both strategies must leave the source scenario unchanged.

---

### Task 1: Domain models and seeded scenario generation

**Files:**
- Create: `package.json`
- Create: `src/domain.js`
- Create: `src/scenario.js`
- Create: `tests/scenario.test.js`

**Interfaces:**
- `createScenario(seed, options?)` returns `{ id, seed, horizonHours, assumptions, trucks, drivers, loads, events }` with default counts 20/20/100.
- `distanceMiles(from, to)` returns great-circle miles multiplied by the road factor.
- `createSeededRandom(seed)` returns a repeatable random-number function.

- [ ] **Step 1: Write failing tests** for stable seeded output, default counts and unique IDs, and calculated road distance using hand-checked coordinates.
- [ ] **Step 2: Run `npm test -- --test-name-pattern="seeded scenario|road distance"`** and verify the expected missing-module/API failures.
- [ ] **Step 3: Implement the minimum domain constants, seeded PRNG, distance function, and scenario generator.** Use valid city codes, paired truck/driver locations, a 120-hour horizon, and generated capacity/equipment/time-window/rate/delay fields.
- [ ] **Step 4: Re-run the focused tests, then `npm test`.** Expect all Task 1 tests to pass.

### Task 2: Feasibility, dispatch strategies, and metrics

**Files:**
- Create: `src/planner.js`
- Create: `src/metrics.js`
- Create: `src/experiment.js`
- Create: `tests/planner.test.js`
- Create: `tests/metrics.test.js`
- Create: `tests/experiment.test.js`

**Interfaces:**
- `evaluateAssignment(scenario, load, truckState, driverState)` returns a feasible assignment or `{ feasible: false, reasons }`.
- `planScenario(scenario, strategy)` accepts `baseline` or `profit-aware` and returns `{ strategy, assignments, rejectedLoads, metrics, violations }`.
- `calculateMetrics(scenario, plan)` returns miles, ratios, utilization, revenue, contribution, cost per mile, on-time estimate, acceptance, and constraint violations.
- `runExperiment(seed, count)` returns paired strategy mean and sample standard deviation for repeatable seeds.
- Planner execution must clone state; comparing strategies cannot mutate the input scenario.

- [ ] **Step 1: Write failing tests** for each hard-constraint rejection, duplicate-load prevention, same truck/driver non-overlap, strategy determinism, source immutability, hand-calculated metrics, and multi-seed summary statistics.
- [ ] **Step 2: Run the focused planner and metric tests** and confirm they fail for missing behavior.
- [ ] **Step 3: Implement the deterministic feasibility evaluator, rate-first baseline, profit-aware global heuristic, and metric calculations.** Explain accepted/rejected choices with reason strings.
- [ ] **Step 4: Run focused tests and the full `npm test` suite.** Expect zero assignment violations.

### Task 3: Approval, simulation events, and JSON API

**Files:**
- Create: `src/execution.js`
- Create: `src/store.js`
- Create: `server.mjs`
- Create: `tests/execution.test.js`
- Create: `tests/api.test.js`

**Interfaces:**
- `approveAssignments(state, assignmentIds)` approves eligible pending items idempotently and records audit events.
- `simulateApprovedAssignments(state)` advances approved assignments once, applies seeded execution delays, updates entities, and records trip events.
- API routes: `POST /api/scenarios`, `GET /api/scenarios/:id`, `POST /api/experiments`, `POST /api/scenarios/:id/compare`, `POST /api/scenarios/:id/dispatch`, `POST /api/scenarios/:id/approve`, `POST /api/scenarios/:id/simulate`.
- `createServer()` returns an HTTP server that tests can bind to a random port.

- [ ] **Step 1: Write failing tests** for approval-required execution, idempotent approval, duplicate simulation prevention, state updates, event order, and API input/status behavior.
- [ ] **Step 2: Run focused lifecycle/API tests** and verify the expected failures.
- [ ] **Step 3: Implement the in-memory store, explicit lifecycle transitions, audit events, and API endpoints.** Bind to loopback by default.
- [ ] **Step 4: Run focused tests and the full `npm test` suite.** Expect malformed requests to return 400 and unknown IDs to return 404.

### Task 4: Dashboard, documentation, and runnable handoff

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`
- Create: `README.md`
- Create: `docs/handover.md`
- Test: `tests/api.test.js` (static asset/API smoke checks if not already covered)

**Interfaces:**
- Browser app uses same-origin API endpoints and remembers the active scenario ID in local storage.
- Overview shows fleet and offer counts, strategy comparison, lane map, dispatch queue, approval controls, event feed, and full load/fleet tables.
- Overview offers a paired eight-seed report with mean and sample standard deviation.
- User can regenerate a scenario, compare strategies, select a plan, approve assignments, and simulate approved trips.

- [ ] **Step 1: Write failing smoke tests** for the served HTML, CSS, and browser module content type / API root behavior.
- [ ] **Step 2: Run smoke tests and confirm the missing assets fail as expected.**
- [ ] **Step 3: Implement the responsive dashboard and user flow.** Label synthetic data and assumptions in the UI; provide loading, empty, and error states; use accessible controls and no external assets.
- [ ] **Step 4: Run `npm test`, start the server, and verify the dashboard and API respond locally.**
- [ ] **Step 5: Update README and project handover with the implemented scope, assumptions, run commands, and limitations.**

## Execution Choice

The user requested the build in this session. Implement natively in the current workspace, task by task, with the user already authorizing the dashboard scope.
