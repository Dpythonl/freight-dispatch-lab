import test from "node:test";
import assert from "node:assert/strict";
import { calculateMetrics } from "../src/metrics.js";

test("metrics use hand-calculated miles, cost, truck-day, and utilization values", () => {
  const scenario = {
    horizonHours: 24,
    trucks: [{ id: "TRK-001" }],
    loads: [{ id: "LD-001" }],
  };
  const plan = {
    assignments: [
      {
        loadId: "LD-001",
        emptyMiles: 30,
        loadedMiles: 100,
        estimatedCost: 221,
        expectedRevenue: 500,
        expectedContribution: 279,
        drivingHours: 2.5,
        onTime: true,
      },
    ],
    violations: [],
  };

  assert.deepEqual(calculateMetrics(scenario, plan), {
    loadsAccepted: 1,
    loadsConsidered: 1,
    acceptanceRate: 1,
    emptyMiles: 30,
    loadedMiles: 100,
    totalMiles: 130,
    emptyMileRatio: 30 / 130,
    loadedMileRatio: 100 / 130,
    revenue: 500,
    variableCost: 221,
    contribution: 279,
    costPerMile: 1.7,
    truckDays: 1,
    revenuePerTruckDay: 500,
    contributionPerTruckDay: 279,
    drivingHours: 2.5,
    availableOperatingHours: 14,
    truckUtilization: 2.5 / 14,
    onTimeDeliveries: 1,
    onTimeDeliveryRate: 1,
    constraintViolations: 0,
  });
});

test("empty plans report zero rates without dividing by zero", () => {
  const metrics = calculateMetrics({ horizonHours: 0, trucks: [], loads: [] }, { assignments: [], violations: [] });

  assert.equal(metrics.emptyMileRatio, 0);
  assert.equal(metrics.acceptanceRate, 0);
  assert.equal(metrics.onTimeDeliveryRate, 0);
  assert.equal(metrics.costPerMile, 0);
  assert.equal(metrics.truckUtilization, 0);
});
