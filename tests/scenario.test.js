import test from "node:test";
import assert from "node:assert/strict";
import { createScenario, distanceMiles } from "../src/scenario.js";

test("a seeded scenario repeats exactly", () => {
  const first = createScenario(7421);
  const second = createScenario(7421);

  assert.deepEqual(first, second);
});

test("the default scenario has 20 trucks, 20 drivers, and 100 unique offers", () => {
  const scenario = createScenario(7);

  assert.equal(scenario.trucks.length, 20);
  assert.equal(scenario.drivers.length, 20);
  assert.equal(scenario.loads.length, 100);
  assert.equal(new Set(scenario.trucks.map(({ id }) => id)).size, 20);
  assert.equal(new Set(scenario.drivers.map(({ id }) => id)).size, 20);
  assert.equal(new Set(scenario.loads.map(({ id }) => id)).size, 100);
});

test("each generated truck starts with its paired driver at the same location", () => {
  const scenario = createScenario(19);
  const drivers = new Map(scenario.drivers.map((driver) => [driver.id, driver]));

  for (const truck of scenario.trucks) {
    const driver = drivers.get(truck.driverId);
    assert.ok(driver, `missing driver ${truck.driverId}`);
    assert.equal(driver.currentLocation, truck.currentLocation);
  }
});

test("scenario includes the location metadata needed to render its lanes", () => {
  const scenario = createScenario(19);

  assert.ok(scenario.cities.some((city) => city.code === scenario.trucks[0].currentLocation));
  assert.ok(scenario.cities.every((city) => Number.isFinite(city.lat) && Number.isFinite(city.lon)));
});

test("road distance applies the documented 1.22 multiplier", () => {
  const miles = distanceMiles({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });

  assert.ok(Math.abs(miles - 84.3) < 0.2, `expected about 84.3 miles, received ${miles}`);
});

test("scenario generation rejects invalid seeds", () => {
  assert.throws(() => createScenario(-1), RangeError);
  assert.throws(() => createScenario(1.5), RangeError);
});
