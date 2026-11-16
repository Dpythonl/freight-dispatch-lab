import test from "node:test";
import assert from "node:assert/strict";
import { approveAssignments, simulateApprovedAssignments } from "../src/execution.js";
import { createSession } from "../src/store.js";
import { planScenario } from "../src/planner.js";
import { makeScenario } from "./fixtures.js";

function sessionWithPlan() {
  const scenario = makeScenario();
  const session = createSession(scenario);
  session.activePlan = planScenario(scenario, "profit-aware");
  return session;
}

test("execution cannot begin before a human approves an assignment", () => {
  const session = sessionWithPlan();

  assert.throws(
    () => simulateApprovedAssignments(session),
    (error) => error.statusCode === 409 && /approve/i.test(error.message),
  );
});

test("approval changes load and assignment state and is idempotent", () => {
  const session = sessionWithPlan();
  const assignmentId = session.activePlan.assignments[0].id;
  const approved = approveAssignments(session, [assignmentId]);
  const eventCount = approved.scenario.events.length;
  const approvedAgain = approveAssignments(approved, [assignmentId]);

  assert.equal(approved.activePlan.assignments[0].decisionStatus, "approved");
  assert.equal(approved.scenario.loads[0].status, "accepted");
  assert.equal(approvedAgain.scenario.events.length, eventCount);
  assert.equal(session.activePlan.assignments[0].decisionStatus, "pending_approval");
});

test("approval rejects unknown assignment IDs without partial changes", () => {
  const session = sessionWithPlan();
  const before = structuredClone(session);

  assert.throws(
    () => approveAssignments(session, ["missing-assignment"]),
    (error) => error.statusCode === 400,
  );
  assert.deepEqual(session, before);
});

test("approved trips update entity states and write ordered execution events once", () => {
  const session = sessionWithPlan();
  const assignmentId = session.activePlan.assignments[0].id;
  const approved = approveAssignments(session, [assignmentId]);
  const completed = simulateApprovedAssignments(approved);
  const assignment = completed.activePlan.assignments[0];
  const load = completed.scenario.loads[0];

  assert.equal(assignment.decisionStatus, "delivered");
  assert.equal(load.status, "delivered");
  assert.equal(completed.scenario.trucks[0].currentLocation, load.destination);
  assert.ok(completed.actualMetrics.onTimeDeliveryRate >= 0);
  assert.deepEqual(
    completed.scenario.events.slice(-3).map(({ type }) => type),
    ["trip_departed", "pickup_completed", "delivery_completed"],
  );
  assert.throws(
    () => simulateApprovedAssignments(completed),
    (error) => error.statusCode === 409 && /approved/i.test(error.message),
  );
});
