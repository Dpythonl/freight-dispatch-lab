import test from "node:test";
import assert from "node:assert/strict";
import { meanAndSampleStdDev, runExperiment } from "../src/experiment.js";

test("mean and sample standard deviation use a hand-checked sample", () => {
  assert.deepEqual(meanAndSampleStdDev([10, 20, 30]), { mean: 20, sampleStdDev: 10 });
});

test("multi-seed evaluation repeats and reports paired strategy results", () => {
  const first = runExperiment(17, 4);
  const second = runExperiment(17, 4);

  assert.deepEqual(first, second);
  assert.deepEqual(first.seeds, [17, 104746, 209475, 314204]);
  assert.equal(first.sampleCount, 4);
  assert.ok(first.strategies.baseline.mean.contributionPerTruckDay > 0);
  assert.ok(first.strategies.profitAware.sampleStdDev.emptyMileRatio > 0);
  assert.ok(Number.isFinite(first.pairedDelta.contributionPerTruckDay.mean));
});

test("multi-seed evaluation validates seed and sample count", () => {
  assert.throws(() => runExperiment(-1, 4), RangeError);
  assert.throws(() => runExperiment(1, 1), RangeError);
  assert.throws(() => runExperiment(1, 21), RangeError);
});
