import { createScenario } from "../src/scenario.js";

export function makeScenario({ loadCount = 1 } = {}) {
  const scenario = createScenario(81, { truckCount: 1, loadCount });
  const truck = scenario.trucks[0];
  const driver = scenario.drivers[0];

  truck.currentLocation = "ATL";
  truck.capacityLb = 40000;
  truck.equipment = "dry_van";
  truck.availableAtHour = 0;
  driver.currentLocation = "ATL";
  driver.hoursAvailable = 11;
  driver.shiftEndHour = 14;
  driver.availableAtHour = 0;
  driver.qualifications = ["CDL"];

  scenario.loads = Array.from({ length: loadCount }, (_, index) => ({
    id: `LD-${String(index + 1).padStart(3, "0")}`,
    origin: "ATL",
    destination: "NSH",
    pickupWindowStartHour: index * 25,
    pickupWindowEndHour: index * 25 + 8,
    deliveryDeadlineHour: index * 25 + 14,
    weightLb: 20000,
    equipmentRequired: "dry_van",
    qualificationRequired: null,
    offeredRate: 1000 + loadCount - index,
    variableCostPerMile: 1.7,
    executionDelayHours: 0,
    status: "offered",
  }));

  scenario.horizonHours = 120;
  return scenario;
}
