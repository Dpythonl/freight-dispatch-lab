const $ = (selector) => document.querySelector(selector);
const pageSize = 8;
const loadPageSize = 10;
const state = { session: null, experiment: null, assignmentPage: 0, loadPage: 0, toastTimer: null };

const strategyNames = {
  baseline: "Rate-first baseline",
  "profit-aware": "Profit-aware heuristic",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}

function money(value, compact = false) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact && Math.abs(value) >= 10000 ? "compact" : "standard",
  }).format(value);
}

function number(value, digits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value ?? 0);
}

function percent(value, digits = 1) {
  return `${number((value ?? 0) * 100, digits)}%`;
}

function formatHour(hours) {
  if (!Number.isFinite(hours)) return "—";
  const day = Math.floor(hours / 24) + 1;
  const totalMinutes = Math.round((hours % 24) * 60);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `D${day} · ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function cityName(code, short = false) {
  const city = state.session?.scenario.cities.find((candidate) => candidate.code === code);
  if (!city) return code ?? "—";
  return short ? `${city.name}, ${city.state}` : city.name;
}

function formatLane(origin, destination) {
  return `${cityName(origin, true)} <span class="lane-arrow">→</span> ${cityName(destination, true)}`;
}

function toast(message, isError = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => element.classList.remove("visible"), 3200);
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Server returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
  return payload;
}

function rememberScenario(id) {
  try { localStorage.setItem("freight-dispatch-scenario-id", id); } catch { /* Storage is optional. */ }
}

function rememberedScenario() {
  try { return localStorage.getItem("freight-dispatch-scenario-id"); } catch { return null; }
}

function currentPlan() {
  if (state.session?.activePlan) return state.session.activePlan;
  return state.session?.comparison?.profitAware ?? null;
}

function currentMetrics() {
  return state.session?.actualMetrics ?? currentPlan()?.metrics ?? null;
}

function setBusy(button, busy, busyLabel = "Working…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.innerHTML;
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${busyLabel}`;
    button.disabled = true;
  } else {
    if (button.dataset.originalLabel) button.innerHTML = button.dataset.originalLabel;
    delete button.dataset.originalLabel;
    button.disabled = false;
  }
}

async function createNewScenario() {
  const seed = Number($("#seed-input").value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
    toast("Use a whole-number seed from 0 to 4294967295.", true);
    return;
  }
  const button = $("#generate-button");
  setBusy(button, true, "Generating…");
  try {
    state.session = await api("/api/scenarios", { seed });
    state.experiment = null;
    rememberScenario(state.session.scenario.id);
    state.assignmentPage = 0;
    state.loadPage = 0;
    render();
    toast(`Scenario ${seed} generated · 20 trucks · 100 freight offers.`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(button, false);
  }
}

async function runExperiment() {
  if (!state.session) return createNewScenario();
  const button = $("#experiment-button");
  setBusy(button, true, "Running…");
  try {
    state.experiment = await api("/api/experiments", { seed: state.session.scenario.seed, count: 8 });
    renderExperiment();
    toast(`Eight paired seeds evaluated from base seed ${state.experiment.baseSeed}.`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(button, false);
  }
}

async function comparePlans() {
  if (!state.session) return createNewScenario();
  const button = $("#compare-button");
  setBusy(button, true, "Comparing…");
  try {
    state.session = await api(`/api/scenarios/${encodeURIComponent(state.session.scenario.id)}/compare`, {});
    state.assignmentPage = 0;
    render();
    toast("Both strategies planned against the same scenario.");
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(button, false);
    renderActionStates();
  }
}

async function choosePlan(strategy) {
  if (!state.session?.comparison) return comparePlans();
  const button = document.querySelector(`[data-use-plan="${strategy}"]`);
  if (button) setBusy(button, true, "Loading…");
  try {
    state.session = await api(`/api/scenarios/${encodeURIComponent(state.session.scenario.id)}/dispatch`, { strategy });
    state.assignmentPage = 0;
    render();
    toast(`${strategyNames[strategy]} is ready for review.`);
    document.querySelector("#dispatch").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    toast(error.message, true);
  } finally {
    renderActionStates();
  }
}

async function approveSelected() {
  const assignmentIds = [...document.querySelectorAll(".assignment-check:checked")].map((input) => input.value);
  if (assignmentIds.length === 0) {
    toast("Select at least one pending assignment to approve.", true);
    return;
  }
  const button = $("#approve-button");
  setBusy(button, true, "Approving…");
  try {
    state.session = await api(`/api/scenarios/${encodeURIComponent(state.session.scenario.id)}/approve`, { assignmentIds });
    render();
    toast(`${assignmentIds.length} assignment${assignmentIds.length === 1 ? "" : "s"} approved for simulation.`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    renderActionStates();
  }
}

async function simulateApproved() {
  const button = $("#simulate-button");
  setBusy(button, true, "Simulating…");
  try {
    state.session = await api(`/api/scenarios/${encodeURIComponent(state.session.scenario.id)}/simulate`, {});
    render();
    const metrics = state.session.actualMetrics;
    toast(`Simulation complete · ${percent(metrics.onTimeDeliveryRate)} on time · ${money(metrics.contribution, true)} contribution.`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    renderActionStates();
  }
}

function selectedPlanAssignments() {
  return state.session?.activePlan?.assignments ?? [];
}

function recommendedLoads() {
  return new Map(selectedPlanAssignments().map((assignment) => [assignment.loadId, assignment]));
}

function statusText(status) {
  const labels = {
    offered: "Offered",
    recommended: "Recommended",
    pending_approval: "Pending approval",
    approved: "Approved",
    accepted: "Accepted",
    in_transit: "In transit",
    picked_up: "Picked up",
    delivered: "Delivered",
    delivered_late: "Delivered late",
  };
  return labels[status] ?? String(status ?? "Unknown").replaceAll("_", " ");
}

function statusClass(status) {
  return String(status ?? "unknown").replaceAll(/[^a-z0-9_-]/gi, "");
}

function renderHeader() {
  const scenario = state.session?.scenario;
  if (!scenario) return;
  $("#seed-input").value = scenario.seed;
  $("#sidebar-scenario").textContent = `Seed ${scenario.seed}`;
  $("#hero-truck-count").textContent = scenario.trucks.length;
  $("#hero-load-count").textContent = scenario.loads.length;
  $("#offers-count").textContent = scenario.loads.length;
  $("#fleet-count").textContent = scenario.trucks.length;
  $("#scenario-date-label").textContent = `Seed ${scenario.seed} · same fleet, offers, and time windows for both strategies`;
  $("#nav-queue-count").textContent = state.session.activePlan?.assignments.length ?? "—";
}

function renderKpis() {
  const metrics = currentMetrics();
  if (!metrics) {
    $("#kpi-contribution").textContent = "—";
    $("#kpi-empty-ratio").textContent = "—";
    $("#kpi-loads").textContent = "—";
    $("#kpi-ontime").textContent = "—";
    $("#kpi-contribution-note").textContent = "Run a comparison to see plan economics";
    $("#kpi-empty-note").textContent = "Deadhead miles ÷ total miles";
    $("#kpi-loads-note").textContent = "Offers accepted by selected plan";
    $("#kpi-ontime-note").textContent = "Based on planned delivery estimates";
    return;
  }
  const isActual = Boolean(state.session.actualMetrics);
  $("#kpi-contribution").textContent = money(metrics.contribution, true);
  $("#kpi-empty-ratio").textContent = percent(metrics.emptyMileRatio);
  $("#kpi-loads").textContent = `${metrics.loadsAccepted} / ${metrics.loadsConsidered}`;
  $("#kpi-ontime").textContent = percent(metrics.onTimeDeliveryRate);
  $("#kpi-contribution-note").textContent = isActual ? "Actual modeled contribution after simulation" : "Expected revenue less modeled variable cost";
  $("#kpi-empty-note").textContent = `${number(metrics.emptyMiles)} empty of ${number(metrics.totalMiles)} total miles`;
  $("#kpi-loads-note").textContent = isActual ? "Approved assignments completed in simulation" : "Offers accepted by selected plan";
  $("#kpi-ontime-note").textContent = isActual ? `${metrics.onTimeDeliveries} deliveries on time` : "Based on planned delivery estimates";
}

function formatComparisonValue(key, metrics) {
  const value = metrics[key];
  if (["emptyMileRatio", "truckUtilization", "onTimeDeliveryRate", "acceptanceRate"].includes(key)) return percent(value);
  if (["contribution", "revenuePerTruckDay", "contributionPerTruckDay"].includes(key)) return money(value, true);
  if (key === "costPerMile") return `${money(value, false)}/mi`;
  if (key === "constraintViolations") return number(value);
  if (key === "loadsAccepted") return number(value);
  return number(value, 1);
}

function formatDelta(key, baseline, proposed) {
  const delta = proposed - baseline;
  if (["emptyMileRatio", "truckUtilization", "onTimeDeliveryRate", "acceptanceRate"].includes(key)) {
    const points = delta * 100;
    return `${points > 0 ? "+" : points < 0 ? "−" : ""}${number(Math.abs(points), 1)} pp`;
  }
  if (["contribution", "revenuePerTruckDay", "contributionPerTruckDay", "costPerMile"].includes(key)) {
    return `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${money(Math.abs(delta), true)}`;
  }
  return `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${number(Math.abs(delta), 1)}`;
}

function renderComparison() {
  const comparison = state.session?.comparison;
  const cards = $("#strategy-cards");
  if (!comparison) {
    cards.innerHTML = '<div class="empty-state compact"><span class="empty-icon">◈</span><strong>Compare strategies to begin</strong><p>Both plans will use this exact fleet and offer set.</p></div>';
    $("#comparison-body").innerHTML = '<tr><td colspan="4" class="table-empty">Metrics appear after comparison</td></tr>';
    renderExperiment();
    return;
  }

  const baseline = comparison.baseline;
  const profitAware = comparison.profitAware;
  const locked = Boolean(state.session.activePlan?.assignments.some((item) => item.decisionStatus !== "pending_approval"));
  const selectedStrategy = state.session.activePlan?.strategy;
  const choices = [
    { key: "baseline", plan: baseline, title: "Rate-first baseline", description: "Sort offers by rate, then choose the first feasible truck." },
    { key: "profit-aware", plan: profitAware, title: "Profit-aware heuristic", description: "Rank near-term feasible loads by contribution and deadhead." },
  ];

  cards.innerHTML = choices.map(({ key, plan, title, description }) => `
    <article class="strategy-card ${selectedStrategy === key ? "selected" : ""}">
      <header><h4>${title}</h4><span class="chosen-pill">SELECTED</span><button class="strategy-select" type="button" data-use-plan="${key}" ${locked ? "disabled" : ""}>Use plan →</button></header>
      <p>${description}</p>
      <div class="strategy-stat-row"><span>Loads / contribution</span><strong>${plan.metrics.loadsAccepted} · ${money(plan.metrics.contribution, true)}</strong></div>
      <div class="strategy-stat-row"><span>Empty miles · utilization</span><strong>${percent(plan.metrics.emptyMileRatio)} · ${percent(plan.metrics.truckUtilization)}</strong></div>
    </article>`).join("");

  const rows = [
    ["Contribution / truck-day", "contributionPerTruckDay"],
    ["Empty-mile ratio", "emptyMileRatio"],
    ["Truck utilization", "truckUtilization"],
    ["On-time delivery", "onTimeDeliveryRate"],
    ["Load acceptance", "acceptanceRate"],
    ["Cost per mile", "costPerMile"],
    ["Constraint violations", "constraintViolations"],
  ];
  $("#comparison-body").innerHTML = rows.map(([label, key]) => `
    <tr><td>${label}</td><td>${formatComparisonValue(key, baseline.metrics)}</td><td>${formatComparisonValue(key, profitAware.metrics)}</td><td>${formatDelta(key, baseline.metrics[key], profitAware.metrics[key])}</td></tr>`).join("");
  renderExperiment();
}

function experimentStatistic(key, summary) {
  const mean = summary.mean[key];
  const standardDeviation = summary.sampleStdDev[key];
  if (["emptyMileRatio", "truckUtilization", "onTimeDeliveryRate", "acceptanceRate"].includes(key)) {
    return `${percent(mean)} <span>± ${number(standardDeviation * 100, 1)} pp</span>`;
  }
  if (["contributionPerTruckDay", "revenuePerTruckDay"].includes(key)) {
    return `${money(mean, true)} <span>± ${money(standardDeviation, true)}</span>`;
  }
  return `${number(mean, 1)} <span>± ${number(standardDeviation, 1)}</span>`;
}

function experimentDelta(key, summary) {
  const mean = summary.mean;
  const standardDeviation = summary.sampleStdDev;
  if (["emptyMileRatio", "truckUtilization", "onTimeDeliveryRate", "acceptanceRate"].includes(key)) {
    const direction = mean > 0 ? "+" : mean < 0 ? "−" : "";
    return `${direction}${number(Math.abs(mean) * 100, 1)} <span>± ${number(standardDeviation * 100, 1)} pp</span>`;
  }
  const direction = mean > 0 ? "+" : mean < 0 ? "−" : "";
  return `${direction}${money(Math.abs(mean), true)} <span>± ${money(standardDeviation, true)}</span>`;
}

function renderExperiment() {
  const container = $("#experiment-results");
  if (!state.experiment) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  const report = state.experiment;
  const metrics = [
    ["Contribution / truck-day", "contributionPerTruckDay"],
    ["Empty-mile ratio", "emptyMileRatio"],
    ["Truck utilization", "truckUtilization"],
    ["On-time delivery", "onTimeDeliveryRate"],
    ["Load acceptance", "acceptanceRate"],
  ];
  container.hidden = false;
  container.innerHTML = `
    <div class="experiment-heading"><div><strong>${report.sampleCount}-seed evaluation</strong><span>Mean ± sample standard deviation · strategies paired on each seed</span></div><span class="experiment-seeds">${report.seeds.map((seed) => `#${seed}`).join(" · ")}</span></div>
    <div class="comparison-table-wrap experiment-table-wrap"><table class="comparison-table experiment-table"><thead><tr><th>Metric</th><th>Rate-first</th><th>Profit-aware</th><th>Paired change</th></tr></thead><tbody>${metrics.map(([label, key]) => `
      <tr><td>${label}</td><td>${experimentStatistic(key, report.strategies.baseline)}</td><td>${experimentStatistic(key, report.strategies.profitAware)}</td><td>${experimentDelta(key, report.pairedDelta[key])}</td></tr>`).join("")}</tbody></table></div>
    <p class="experiment-note">Each seed generates an independent 20-truck / 100-offer scenario. The paired change is profit-aware minus baseline; variability is shown so one favorable seed does not stand in for the full run.</p>`;
}

function projectCity(city) {
  const x = 24 + ((city.lon + 100) / 22) * 752;
  const y = 20 + ((45 - city.lat) / 19) * 320;
  return { x, y };
}

function renderMap() {
  const scenario = state.session?.scenario;
  if (!scenario) return;
  const plan = currentPlan();
  const assignments = plan?.assignments ?? [];
  const cityByCode = new Map(scenario.cities.map((city) => [city.code, city]));
  const fleetCounts = new Map();
  for (const truck of scenario.trucks) fleetCounts.set(truck.currentLocation, (fleetCounts.get(truck.currentLocation) ?? 0) + 1);
  const usedCodes = new Set([...fleetCounts.keys()]);
  for (const assignment of assignments) {
    usedCodes.add(assignment.origin);
    usedCodes.add(assignment.destination);
  }
  const lanes = assignments.slice(0, 30).map((assignment) => {
    const origin = cityByCode.get(assignment.origin);
    const destination = cityByCode.get(assignment.destination);
    if (!origin || !destination) return "";
    const from = projectCity(origin);
    const to = projectCity(destination);
    const approved = assignment.decisionStatus && assignment.decisionStatus !== "pending_approval";
    return `<line class="map-lane ${approved ? "approved" : ""}" x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" />`;
  }).join("");
  const points = [...usedCodes].map((code, index) => {
    const city = cityByCode.get(code);
    if (!city) return "";
    const position = projectCity(city);
    const fleetCount = fleetCounts.get(code) ?? 0;
    const label = index < 12 || fleetCount > 0;
    return `<g><circle class="map-point" cx="${position.x.toFixed(1)}" cy="${position.y.toFixed(1)}" r="${fleetCount > 0 ? 5 : 3.4}" /><circle class="map-point-core" cx="${position.x.toFixed(1)}" cy="${position.y.toFixed(1)}" r="${fleetCount > 0 ? 2.1 : 1.2}" />${label ? `<text class="map-city-label" x="${(position.x + 7).toFixed(1)}" y="${(position.y - 5).toFixed(1)}">${escapeHtml(city.code)}</text>` : ""}</g>`;
  }).join("");
  const grid = Array.from({ length: 7 }, (_, index) => `<line class="map-gridline" x1="${40 + index * 120}" y1="0" x2="${40 + index * 120}" y2="360" />`).join("") +
    Array.from({ length: 4 }, (_, index) => `<line class="map-gridline" x1="0" y1="${40 + index * 90}" x2="800" y2="${40 + index * 90}" />`).join("");
  $("#lane-map").innerHTML = `<svg class="map-svg" viewBox="0 0 800 360" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect class="map-water" x="0" y="0" width="800" height="360" rx="8" /><path class="map-land" d="M40 74 L104 43 L194 32 L284 48 L362 34 L451 56 L529 47 L617 62 L690 85 L756 110 L741 142 L775 178 L739 207 L721 247 L679 263 L655 295 L610 319 L565 309 L523 327 L476 308 L434 322 L399 300 L353 310 L318 288 L277 296 L242 270 L202 260 L167 229 L125 216 L99 187 L69 165 L57 129 Z" />${grid}<g>${lanes}</g><g>${points}</g></svg>`;
  $("#map-city-count").textContent = usedCodes.size;
  $("#map-lane-count").textContent = assignments.length;
}

function renderAssignments() {
  const plan = state.session?.activePlan;
  const body = $("#assignment-body");
  if (!plan) {
    body.innerHTML = '<tr><td colspan="7" class="table-empty">No dispatch plan selected.</td></tr>';
    $("#assignment-count").textContent = "0";
    $("#assignment-page-label").textContent = "No assignments";
    renderActionStates();
    return;
  }
  const assignments = [...plan.assignments].sort(
    (a, b) => b.expectedContribution - a.expectedContribution || a.departureHour - b.departureHour,
  );
  $("#assignment-count").textContent = assignments.length;
  if (assignments.length === 0) {
    body.innerHTML = '<tr><td colspan="7" class="table-empty">No feasible recommendations in this scenario.</td></tr>';
    $("#assignment-page-label").textContent = "No assignments";
    renderActionStates();
    return;
  }
  const pageCount = Math.ceil(assignments.length / pageSize);
  state.assignmentPage = Math.min(state.assignmentPage, pageCount - 1);
  const pageItems = assignments.slice(state.assignmentPage * pageSize, (state.assignmentPage + 1) * pageSize);
  const loads = new Map(state.session.scenario.loads.map((load) => [load.id, load]));
  const trucks = new Map(state.session.scenario.trucks.map((truck) => [truck.id, truck]));
  const drivers = new Map(state.session.scenario.drivers.map((driver) => [driver.id, driver]));
  body.innerHTML = pageItems.map((assignment) => {
    const load = loads.get(assignment.loadId);
    const truck = trucks.get(assignment.truckId);
    const driver = drivers.get(assignment.driverId);
    const pending = assignment.decisionStatus === "pending_approval";
    return `<tr>
      <td class="check-column">${pending ? `<input class="assignment-check" type="checkbox" value="${escapeHtml(assignment.id)}" aria-label="Select ${escapeHtml(assignment.loadId)}" />` : ""}</td>
      <td><span class="load-primary">${escapeHtml(assignment.loadId)}</span><span class="load-secondary">${formatLane(assignment.origin, assignment.destination)}</span><span class="load-tertiary" title="${escapeHtml(assignment.explanation)}">${escapeHtml(assignment.explanation)}</span></td>
      <td class="truck-cell"><strong>${escapeHtml(assignment.truckId)} · ${escapeHtml(truck?.equipment ?? "")}</strong><small>${escapeHtml(driver?.name ?? assignment.driverId)}</small></td>
      <td class="muted-cell">${number(assignment.emptyMiles)} mi</td>
      <td class="money-cell">${money(assignment.expectedContribution)}</td>
      <td class="muted-cell">${formatHour(assignment.actualDeliveryHour ?? assignment.deliveryEtaHour)}</td>
      <td><span class="status-pill ${statusClass(assignment.decisionStatus)}">${statusText(assignment.decisionStatus)}</span></td>
    </tr>`;
  }).join("");
  $("#assignment-page-label").textContent = `Showing ${state.assignmentPage * pageSize + 1}–${Math.min((state.assignmentPage + 1) * pageSize, assignments.length)} of ${assignments.length} recommendations`;
  $("#assignment-prev").disabled = state.assignmentPage === 0;
  $("#assignment-next").disabled = state.assignmentPage >= pageCount - 1;
  renderActionStates();
}

function renderLoads() {
  const scenario = state.session?.scenario;
  const body = $("#loads-body");
  if (!scenario) return;
  const query = $("#load-search").value.trim().toLowerCase();
  const filter = $("#load-status-filter").value;
  const recommendations = recommendedLoads();
  const rejectionReasons = new Map((state.session.activePlan?.rejectedLoads ?? []).map((item) => [item.loadId, item.reasons]));
  const visible = scenario.loads.filter((load) => {
    const assignment = recommendations.get(load.id);
    const viewStatus = load.status === "offered" && assignment ? "recommended" : load.status;
    const matchesQuery = !query || `${load.id} ${load.origin} ${load.destination} ${cityName(load.origin)} ${cityName(load.destination)}`.toLowerCase().includes(query);
    const matchesStatus = filter === "all" || viewStatus === filter || (filter === "delivered" && viewStatus === "delivered_on_time");
    return matchesQuery && matchesStatus;
  });
  const pageCount = Math.max(1, Math.ceil(visible.length / loadPageSize));
  state.loadPage = Math.min(state.loadPage, pageCount - 1);
  const pageItems = visible.slice(state.loadPage * loadPageSize, (state.loadPage + 1) * loadPageSize);
  if (pageItems.length === 0) {
    body.innerHTML = '<tr><td colspan="8" class="table-empty">No offers match this filter.</td></tr>';
  } else {
    body.innerHTML = pageItems.map((load) => {
      const assignment = recommendations.get(load.id);
      const viewStatus = load.status === "offered" && assignment ? "recommended" : load.status;
      const explanation = assignment?.explanation ?? rejectionReasons.get(load.id)?.[0] ?? "Not included in the selected plan";
      return `<tr>
        <td><span class="load-primary">${escapeHtml(load.id)}</span><span class="load-secondary" title="${escapeHtml(explanation)}">${assignment ? "Recommended" : state.session.activePlan ? `Not selected · ${escapeHtml(explanation)}` : "Offer available"}</span></td>
        <td class="lane-cell">${formatLane(load.origin, load.destination)}</td>
        <td class="muted-cell">${formatHour(load.pickupWindowStartHour)} – ${formatHour(load.pickupWindowEndHour)}</td>
        <td class="muted-cell">${formatHour(load.deliveryDeadlineHour)}</td>
        <td>${escapeHtml(load.equipmentRequired.replaceAll("_", " "))}</td>
        <td class="muted-cell">${number(load.weightLb)} lb</td>
        <td class="money-cell">${money(load.offeredRate)}</td>
        <td><span class="status-pill ${statusClass(viewStatus)}">${statusText(viewStatus)}</span></td>
      </tr>`;
    }).join("");
  }
  $("#loads-page-label").textContent = visible.length
    ? `Showing ${state.loadPage * loadPageSize + 1}–${Math.min((state.loadPage + 1) * loadPageSize, visible.length)} of ${visible.length} offers`
    : "No matching offers";
  $("#loads-prev").disabled = state.loadPage === 0 || visible.length === 0;
  $("#loads-next").disabled = state.loadPage >= pageCount - 1 || visible.length === 0;
}

function renderFleet() {
  const scenario = state.session?.scenario;
  if (!scenario) return;
  const assignments = selectedPlanAssignments();
  const truckAssignments = new Map();
  for (const assignment of assignments) {
    const current = truckAssignments.get(assignment.truckId) ?? [];
    current.push(assignment);
    truckAssignments.set(assignment.truckId, current);
  }
  const drivers = new Map(scenario.drivers.map((driver) => [driver.id, driver]));
  let available = 0;
  let assigned = 0;
  $("#fleet-body").innerHTML = scenario.trucks.map((truck) => {
    const driver = drivers.get(truck.driverId);
    const truckPlan = truckAssignments.get(truck.id) ?? [];
    const isCommitted = truckPlan.some((item) => ["approved", "in_transit", "picked_up"].includes(item.decisionStatus));
    const isRecommended = truckPlan.some((item) => item.decisionStatus === "pending_approval");
    const status = isCommitted ? "assigned" : isRecommended ? "pending_approval" : truck.availabilityStatus;
    if (isCommitted || isRecommended) assigned += 1;
    else available += 1;
    return `<tr>
      <td><span class="load-primary">${escapeHtml(truck.id)}</span></td>
      <td>${escapeHtml(cityName(truck.currentLocation, true))}</td>
      <td class="truck-cell"><strong>${escapeHtml(driver?.name ?? truck.driverId)}</strong><small>${escapeHtml((driver?.qualifications ?? []).join(" · "))}</small></td>
      <td>${escapeHtml(truck.equipment.replaceAll("_", " "))}</td>
      <td class="muted-cell">${number(truck.capacityLb)} lb</td>
      <td class="muted-cell">${number(driver?.hoursAvailable ?? 0, 1)} hr / shift</td>
      <td><span class="status-pill ${statusClass(status)}">${status === "assigned" ? "Reserved" : statusText(status)}</span></td>
    </tr>`;
  }).join("");
  $("#available-count").textContent = available;
  $("#assigned-count").textContent = assigned;
}

function eventIcon(type) {
  if (type.includes("delivery")) return type === "delivery_late" ? "!" : "✓";
  if (type.includes("approval")) return "✓";
  if (type.includes("pickup")) return "↗";
  if (type.includes("plan") || type.includes("comparison")) return "◈";
  return "•";
}

function renderEvents() {
  const events = state.session?.scenario.events ?? [];
  const visible = [...events].reverse().slice(0, 7);
  $("#event-count").textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
  if (!visible.length) {
    $("#event-list").innerHTML = '<div class="empty-state"><span class="empty-icon">◷</span><strong>Activity will appear here</strong><p>Scenario generation, approvals, and simulation outcomes are recorded.</p></div>';
    return;
  }
  $("#event-list").innerHTML = visible.map((event) => `
    <article class="event-item"><span class="event-marker ${statusClass(event.type)}">${eventIcon(event.type)}</span><div class="event-copy"><strong>${escapeHtml(event.message)}</strong><small>${formatHour(event.atHour)}${event.location ? ` · ${escapeHtml(cityName(event.location, true))}` : ""}</small></div></article>`).join("");
}

function renderAssumptions() {
  const assumptions = state.session?.scenario.assumptions;
  if (!assumptions) return;
  const items = [
    ["Distance estimate", `Great-circle miles × ${assumptions.roadDistanceFactor}`],
    ["Average speed", `${assumptions.averageSpeedMph} mph`],
    ["Variable cost", `${money(assumptions.variableCostPerMile, false)} per mile`],
    ["Driver limits", `${assumptions.driverDrivingLimitHours} drive hr / ${assumptions.driverShiftLimitHours} hr shift`],
    ["Required rest", `${assumptions.driverRestHours} hours between shifts`],
    ["Load handling", `${assumptions.handlingHours} hours per pickup`],
    ["Scenario window", `${assumptions.scenarioHorizonHours / 24} simulated days`],
    ["Data source", "Synthetic · seeded · reproducible"],
  ];
  $("#assumption-grid").innerHTML = items.map(([label, value]) => `<div class="assumption-item"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("");
}

function renderDispatchStatus() {
  const plan = state.session?.activePlan;
  const element = $("#dispatch-status");
  const note = $("#dispatch-note");
  if (!plan) {
    element.innerHTML = '<span class="status-dot muted"></span><span>Compare plans first</span>';
    note.textContent = "Review suggested truck and driver pairings, then approve before simulation.";
    return;
  }
  const pending = plan.assignments.filter((item) => item.decisionStatus === "pending_approval").length;
  const approved = plan.assignments.filter((item) => item.decisionStatus === "approved").length;
  const delivered = plan.assignments.filter((item) => ["delivered", "delivered_late"].includes(item.decisionStatus)).length;
  if (delivered) {
    element.innerHTML = `<span class="status-dot"></span><span>Simulation · ${delivered} completed</span>`;
    note.textContent = `${strategyNames[plan.strategy]} · ${pending} awaiting approval · ${approved} approved and ready`;
  } else if (approved) {
    element.innerHTML = `<span class="status-dot"></span><span>${approved} approved · ready to simulate</span>`;
    note.textContent = `${strategyNames[plan.strategy]} · ${pending} still pending approval`;
  } else {
    element.innerHTML = '<span class="status-dot muted"></span><span>Recommendations pending review</span>';
    note.textContent = `${strategyNames[plan.strategy]} · ${pending} recommendations await your approval`;
  }
}

function renderActionStates() {
  const plan = state.session?.activePlan;
  const assignments = plan?.assignments ?? [];
  const pending = assignments.filter((item) => item.decisionStatus === "pending_approval").length;
  const approved = assignments.filter((item) => item.decisionStatus === "approved").length;
  const checkedCount = document.querySelectorAll(".assignment-check:checked").length;
  const locked = assignments.some((item) => item.decisionStatus !== "pending_approval");
  $("#approve-button").disabled = !checkedCount || locked && pending === 0;
  $("#simulate-button").disabled = approved === 0;
  $("#select-pending-button").disabled = pending === 0;
  $("#select-pending-button").textContent = checkedCount ? "Clear selection" : "Select pending";
  for (const button of document.querySelectorAll("[data-use-plan]")) button.disabled = locked;
  $("#compare-button").disabled = Boolean($("#compare-button").dataset.originalLabel);
}

function render() {
  if (!state.session) return;
  renderHeader();
  renderKpis();
  renderComparison();
  renderMap();
  renderAssignments();
  renderLoads();
  renderFleet();
  renderEvents();
  renderAssumptions();
  renderDispatchStatus();
  renderActionStates();
}

function listen() {
  $("#generate-button").addEventListener("click", createNewScenario);
  $("#compare-button").addEventListener("click", comparePlans);
  $("#experiment-button").addEventListener("click", runExperiment);
  $("#approve-button").addEventListener("click", approveSelected);
  $("#simulate-button").addEventListener("click", simulateApproved);

  $("#strategy-cards").addEventListener("click", (event) => {
    const button = event.target.closest("[data-use-plan]");
    if (button && !button.disabled) choosePlan(button.dataset.usePlan);
  });

  $("#select-pending-button").addEventListener("click", () => {
    const checks = [...document.querySelectorAll(".assignment-check")];
    const select = checks.some((item) => !item.checked);
    for (const checkbox of checks) checkbox.checked = select;
    renderActionStates();
  });

  $("#assignment-body").addEventListener("change", renderActionStates);
  $("#assignment-prev").addEventListener("click", () => { state.assignmentPage -= 1; renderAssignments(); });
  $("#assignment-next").addEventListener("click", () => { state.assignmentPage += 1; renderAssignments(); });
  $("#loads-prev").addEventListener("click", () => { state.loadPage -= 1; renderLoads(); });
  $("#loads-next").addEventListener("click", () => { state.loadPage += 1; renderLoads(); });
  $("#load-search").addEventListener("input", () => { state.loadPage = 0; renderLoads(); });
  $("#load-status-filter").addEventListener("change", () => { state.loadPage = 0; renderLoads(); });

  const navLinks = [...document.querySelectorAll(".nav-link")];
  for (const link of navLinks) {
    link.addEventListener("click", () => {
      for (const item of navLinks) item.classList.toggle("active", item === link);
    });
  }
}

async function init() {
  listen();
  const priorId = rememberedScenario();
  if (priorId) {
    try {
      state.session = await api(`/api/scenarios/${encodeURIComponent(priorId)}`);
      render();
      return;
    } catch {
      // The in-memory session may have ended when the local server restarted.
    }
  }
  await createNewScenario();
}

init().catch((error) => toast(error.message, true));
