import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.mjs";

async function withServer(run) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("API creates, compares, approves, and simulates a scenario", async () => {
  await withServer(async (baseUrl) => {
    const createdResponse = await request(baseUrl, "/api/scenarios", { seed: 17 });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.scenario.trucks.length, 20);
    assert.equal(created.scenario.loads.length, 100);

    const scenarioId = created.scenario.id;
    const compareResponse = await request(baseUrl, `/api/scenarios/${scenarioId}/compare`, {});
    assert.equal(compareResponse.status, 200);
    const compared = await compareResponse.json();
    assert.ok(compared.comparison.baseline.metrics);
    assert.ok(compared.comparison.profitAware.metrics);

    const dispatchResponse = await request(baseUrl, `/api/scenarios/${scenarioId}/dispatch`, {
      strategy: "profit-aware",
    });
    assert.equal(dispatchResponse.status, 200);
    const dispatched = await dispatchResponse.json();
    assert.ok(dispatched.activePlan.assignments.length > 0);

    const beforeApproval = await request(baseUrl, `/api/scenarios/${scenarioId}/simulate`, {});
    assert.equal(beforeApproval.status, 409);

    const assignmentIds = dispatched.activePlan.assignments.slice(0, 2).map(({ id }) => id);
    const approvalResponse = await request(baseUrl, `/api/scenarios/${scenarioId}/approve`, { assignmentIds });
    assert.equal(approvalResponse.status, 200);

    const simulationResponse = await request(baseUrl, `/api/scenarios/${scenarioId}/simulate`, {});
    assert.equal(simulationResponse.status, 200);
    const simulated = await simulationResponse.json();
    assert.ok(simulated.scenario.events.some(({ type }) => type === "delivery_completed" || type === "delivery_late"));
  });
});

test("API validates malformed JSON and unknown scenario IDs", async () => {
  await withServer(async (baseUrl) => {
    const malformed = await fetch(`${baseUrl}/api/scenarios`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);

    const missing = await fetch(`${baseUrl}/api/scenarios/absent`, { method: "GET" });
    assert.equal(missing.status, 404);

    const invalidSeed = await request(baseUrl, "/api/scenarios", { seed: -1 });
    assert.equal(invalidSeed.status, 400);

    const invalidShape = await request(baseUrl, "/api/scenarios", null);
    assert.equal(invalidShape.status, 400);
  });
});

test("API runs a paired multi-seed strategy evaluation", async () => {
  await withServer(async (baseUrl) => {
    const response = await request(baseUrl, "/api/experiments", { seed: 17, count: 4 });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.sampleCount, 4);
    assert.equal(result.seeds.length, 4);
    assert.ok(Number.isFinite(result.strategies.baseline.mean.contributionPerTruckDay));
    assert.ok(Number.isFinite(result.strategies.profitAware.sampleStdDev.contributionPerTruckDay));
  });
});

test("server serves the dashboard assets with browser-safe content types", async () => {
  await withServer(async (baseUrl) => {
    const html = await fetch(baseUrl);
    assert.equal(html.status, 200);
    assert.match(html.headers.get("content-type"), /text\/html/);

    const css = await fetch(`${baseUrl}/styles.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type"), /text\/css/);

    const script = await fetch(`${baseUrl}/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type"), /javascript/);
  });
});
