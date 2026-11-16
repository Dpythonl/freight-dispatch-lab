import test from "node:test";
import assert from "node:assert/strict";
import { planScenario } from "../src/planner.js";
import { createScenario } from "../src/scenario.js";

test("profit-aware dispatch lowers empty miles and improves economics across repeatable seeds", () => {
  const seeds = [1, 17, 42, 99, 2026, 7421];
  const totals = {
    baseline: { assignments: 0, contribution: 0, emptyRatio: 0, utilization: 0 },
    profitAware: { assignments: 0, contribution: 0, emptyRatio: 0, utilization: 0 },
  };

  for (const seed of seeds) {
    const scenario = createScenario(seed);
    const baseline = planScenario(scenario, "baseline");
    const profitAware = planScenario(scenario, "profit-aware");
    totals.baseline.assignments += baseline.metrics.loadsAccepted;
    totals.baseline.contribution += baseline.metrics.contribution;
    totals.baseline.emptyRatio += baseline.metrics.emptyMileRatio;
    totals.baseline.utilization += baseline.metrics.truckUtilization;
    totals.profitAware.assignments += profitAware.metrics.loadsAccepted;
    totals.profitAware.contribution += profitAware.metrics.contribution;
    totals.profitAware.emptyRatio += profitAware.metrics.emptyMileRatio;
    totals.profitAware.utilization += profitAware.metrics.truckUtilization;
    assert.equal(baseline.violations.length, 0);
    assert.equal(profitAware.violations.length, 0);
  }

  assert.ok(totals.profitAware.contribution > totals.baseline.contribution);
  assert.ok(totals.profitAware.emptyRatio < totals.baseline.emptyRatio);
  assert.ok(totals.profitAware.assignments >= totals.baseline.assignments * 0.85);
  assert.ok(totals.profitAware.utilization >= totals.baseline.utilization * 0.85);
});
