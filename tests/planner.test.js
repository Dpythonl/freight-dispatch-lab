import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAssignment, planScenario } from "../src/planner.js";
import { makeScenario } from "./fixtures.js";

test("a load is feasible when equipment, capacity, location, time, and hours fit", () => {
  const scenario = makeScenario();
  const result = evaluateAssignment(scenario, scenario.loads[0], scenario.trucks[0], scenario.drivers[0]);

  assert.equal(result.feasible, true);
  assert.ok(result.assignment.loadedMiles > 0);
  assert.ok(result.assignment.deliveryEtaHour <= scenario.loads[0].deliveryDeadlineHour);
});

test("an over-capacity load is rejected with a capacity reason", () => {
  const scenario = makeScenario();
  scenario.loads[0].weightLb = 40001;
  const result = evaluateAssignment(scenario, scenario.loads[0], scenario.trucks[0], scenario.drivers[0]);

  assert.equal(result.feasible, false);
  assert.ok(result.reasons.includes("Load exceeds truck capacity"));
});

test("a load requiring incompatible equipment is rejected", () => {
  const scenario = makeScenario();
  scenario.loads[0].equipmentRequired = "reefer";
  const result = evaluateAssignment(scenario, scenario.loads[0], scenario.trucks[0], scenario.drivers[0]);

  assert.equal(result.feasible, false);
  assert.ok(result.reasons.includes("Required equipment is unavailable"));
});

test("a hazmat load is rejected for a driver without the endorsement", () => {
  const scenario = makeScenario();
  scenario.loads[0].qualificationRequired = "hazmat";
  const result = evaluateAssignment(scenario, scenario.loads[0], scenario.trucks[0], scenario.drivers[0]);

  assert.equal(result.feasible, false);
  assert.ok(result.reasons.includes("Driver lacks hazmat qualification"));
});

test("a late pickup and a late delivery are rejected", () => {
  const pickupScenario = makeScenario();
  pickupScenario.trucks[0].availableAtHour = 20;
  pickupScenario.drivers[0].availableAtHour = 20;
  pickupScenario.drivers[0].shiftEndHour = 34;
  pickupScenario.loads[0].pickupWindowStartHour = 0;
  pickupScenario.loads[0].pickupWindowEndHour = 2;
  const latePickup = evaluateAssignment(
    pickupScenario,
    pickupScenario.loads[0],
    pickupScenario.trucks[0],
    pickupScenario.drivers[0],
  );
  assert.ok(latePickup.reasons.includes("Pickup window cannot be met"));

  const deliveryScenario = makeScenario();
  deliveryScenario.loads[0].deliveryDeadlineHour = 1;
  const lateDelivery = evaluateAssignment(
    deliveryScenario,
    deliveryScenario.loads[0],
    deliveryScenario.trucks[0],
    deliveryScenario.drivers[0],
  );
  assert.ok(lateDelivery.reasons.includes("Delivery deadline cannot be met"));
});

test("a driver and truck must start in the same location", () => {
  const scenario = makeScenario();
  scenario.drivers[0].currentLocation = "DAL";
  const result = evaluateAssignment(scenario, scenario.loads[0], scenario.trucks[0], scenario.drivers[0]);

  assert.ok(result.reasons.includes("Driver and truck are not co-located"));
});

test("a trip beyond the driver's shift or driving hours is rejected", () => {
  const scenario = makeScenario();
  scenario.drivers[0].hoursAvailable = 0.5;
  const result = evaluateAssignment(scenario, scenario.loads[0], scenario.trucks[0], scenario.drivers[0]);

  assert.ok(result.reasons.includes("Driver hours would be exceeded"));
});

test("both strategies produce deterministic plans without duplicating loads or overlapping shifts", () => {
  const scenario = makeScenario({ loadCount: 3 });
  const original = structuredClone(scenario);

  for (const strategy of ["baseline", "profit-aware"]) {
    const first = planScenario(scenario, strategy);
    const second = planScenario(scenario, strategy);
    const assignedLoadIds = first.assignments.map(({ loadId }) => loadId);

    assert.equal(first.assignments.length, 3);
    assert.ok(first.assignments[0].explanation.includes(strategy === "baseline" ? "Rate-first" : "Profit-aware"));
    assert.deepEqual(first, second);
    assert.equal(new Set(assignedLoadIds).size, assignedLoadIds.length);
    assert.equal(first.violations.length, 0);
    for (let index = 1; index < first.assignments.length; index += 1) {
      assert.ok(first.assignments[index].departureHour >= first.assignments[index - 1].driverAvailableBeforeHour);
      assert.ok(first.assignments[index].departureHour >= first.assignments[index - 1].truckAvailableBeforeHour);
    }
  }

  assert.deepEqual(scenario, original);
});

test("unknown strategy names are rejected", () => {
  assert.throws(() => planScenario(makeScenario(), "magic"), RangeError);
});
