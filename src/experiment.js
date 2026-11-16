import { createScenario } from "./scenario.js";
import { planScenario } from "./planner.js";
import { roundTo } from "./domain.js";

const REPORTED_METRICS = [
  "loadsAccepted",
  "emptyMileRatio",
  "truckUtilization",
  "contributionPerTruckDay",
  "revenuePerTruckDay",
  "onTimeDeliveryRate",
  "acceptanceRate",
  "constraintViolations",
];

export function meanAndSampleStdDev(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Provide at least one finite numeric value.");
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sampleVariance = values.length > 1
    ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
    : 0;
  return {
    mean: roundTo(mean, 4),
    sampleStdDev: roundTo(Math.sqrt(sampleVariance), 4),
  };
}

function summarizeRuns(runs) {
  const mean = {};
  const sampleStdDev = {};
  for (const key of REPORTED_METRICS) {
    const summary = meanAndSampleStdDev(runs.map((run) => run[key]));
    mean[key] = summary.mean;
    sampleStdDev[key] = summary.sampleStdDev;
  }
  return { mean, sampleStdDev };
}

export function runExperiment(seed, count = 8) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("Seed must be an integer between 0 and 4294967295.");
  }
  if (!Number.isInteger(count) || count < 2 || count > 20) {
    throw new RangeError("Experiment count must be an integer between 2 and 20.");
  }

  const seeds = Array.from({ length: count }, (_, index) => (seed + index * 104729) >>> 0);
  const baselineRuns = [];
  const profitAwareRuns = [];
  const pairedDeltas = Object.fromEntries(REPORTED_METRICS.map((key) => [key, []]));

  for (const scenarioSeed of seeds) {
    const scenario = createScenario(scenarioSeed);
    const baseline = planScenario(scenario, "baseline").metrics;
    const profitAware = planScenario(scenario, "profit-aware").metrics;
    baselineRuns.push(baseline);
    profitAwareRuns.push(profitAware);
    for (const key of REPORTED_METRICS) pairedDeltas[key].push(profitAware[key] - baseline[key]);
  }

  return {
    baseSeed: seed,
    sampleCount: count,
    seeds,
    strategies: {
      baseline: summarizeRuns(baselineRuns),
      profitAware: summarizeRuns(profitAwareRuns),
    },
    pairedDelta: Object.fromEntries(
      REPORTED_METRICS.map((key) => [key, meanAndSampleStdDev(pairedDeltas[key])]),
    ),
  };
}
