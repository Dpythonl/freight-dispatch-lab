import {
  ASSUMPTIONS,
  CITIES,
  CITY_BY_CODE,
  DEFAULT_LOAD_COUNT,
  DEFAULT_TRUCK_COUNT,
  DRIVER_DRIVING_LIMIT_HOURS,
  SCENARIO_HORIZON_HOURS,
  choose,
  createSeededRandom,
  integerBetween,
  roundTo,
} from "./domain.js";

const EARTH_RADIUS_MILES = 3958.7613;
const CITY_CODES = CITIES.map(({ code }) => code);

export function distanceMiles(from, to) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(to.lat - from.lat);
  const longitudeDelta = radians(to.lon - from.lon);
  const fromLatitude = radians(from.lat);
  const toLatitude = radians(to.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const arcMiles = 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(Math.min(1, haversine)));
  return roundTo(arcMiles * ASSUMPTIONS.roadDistanceFactor, 1);
}

function validateSeed(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("Seed must be an integer between 0 and 4294967295.");
  }
}

function validateCount(name, value, maximum) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 0 and ${maximum}.`);
  }
}

function pickDestination(random, origin) {
  const options = CITY_CODES.filter((code) => {
    if (code === origin) return false;
    const miles = distanceMiles(CITY_BY_CODE.get(origin), CITY_BY_CODE.get(code));
    return miles >= 55 && miles <= 520;
  });
  return choose(random, options);
}

function equipmentForLoad(random) {
  const pick = random();
  if (pick < 0.2) return "reefer";
  if (pick < 0.36) return "flatbed";
  return "dry_van";
}

function makeFleet(random, count) {
  const trucks = [];
  const drivers = [];
  const equipmentCycle = ["dry_van", "dry_van", "reefer", "dry_van", "flatbed"];
  const capacityCycle = [32000, 40000, 45000, 48000];

  for (let index = 0; index < count; index += 1) {
    const id = `TRK-${String(index + 1).padStart(3, "0")}`;
    const driverId = `DRV-${String(index + 1).padStart(3, "0")}`;
    const currentLocation = choose(random, CITY_CODES);
    const equipment = equipmentCycle[index % equipmentCycle.length];
    const hasHazmat = random() < 0.14;
    const driver = {
      id: driverId,
      name: `Driver ${String(index + 1).padStart(2, "0")}`,
      availabilityStatus: "available",
      currentLocation,
      availableAtHour: 0,
      hoursAvailable: DRIVER_DRIVING_LIMIT_HOURS,
      shiftEndHour: 14,
      qualifications: hasHazmat ? ["CDL", "hazmat"] : ["CDL"],
    };
    const truck = {
      id,
      driverId,
      currentLocation,
      capacityLb: capacityCycle[index % capacityCycle.length],
      equipment,
      availabilityStatus: "available",
      availableAtHour: 0,
      odometerMiles: 0,
    };
    trucks.push(truck);
    drivers.push(driver);
  }

  return { trucks, drivers };
}

function makeLoads(random, count) {
  const loads = [];

  for (let index = 0; index < count; index += 1) {
    const origin = choose(random, CITY_CODES);
    const destination = pickDestination(random, origin);
    const loadedMiles = distanceMiles(CITY_BY_CODE.get(origin), CITY_BY_CODE.get(destination));
    const pickupWindowStartHour = integerBetween(random, 0, SCENARIO_HORIZON_HOURS - 30);
    const pickupWindowEndHour = pickupWindowStartHour + integerBetween(random, 3, 8);
    const deliveryDeadlineHour = roundTo(
      pickupWindowEndHour + loadedMiles / ASSUMPTIONS.averageSpeedMph + integerBetween(random, 2, 8),
      1,
    );
    const equipmentRequired = equipmentForLoad(random);
    const weightLb = integerBetween(random, 8000, equipmentRequired === "flatbed" ? 46000 : 44000);
    const ratePerMile = roundTo(2.55 + random() * 0.9, 2);
    const offeredRate = Math.round(115 + loadedMiles * ratePerMile);
    const executionDelayHours = random() < 0.22 ? roundTo(0.5 + random() * 3.5, 1) : 0;

    loads.push({
      id: `LD-${String(index + 1).padStart(3, "0")}`,
      origin,
      destination,
      pickupWindowStartHour,
      pickupWindowEndHour,
      deliveryDeadlineHour,
      weightLb,
      equipmentRequired,
      qualificationRequired: random() < 0.1 ? "hazmat" : null,
      offeredRate,
      variableCostPerMile: ASSUMPTIONS.variableCostPerMile,
      executionDelayHours,
      status: "offered",
    });
  }

  return loads;
}

export function createScenario(seed, options = {}) {
  validateSeed(seed);
  const truckCount = options.truckCount ?? DEFAULT_TRUCK_COUNT;
  const loadCount = options.loadCount ?? DEFAULT_LOAD_COUNT;
  validateCount("truckCount", truckCount, 200);
  validateCount("loadCount", loadCount, 2000);

  const random = createSeededRandom(seed);
  const { trucks, drivers } = makeFleet(random, truckCount);
  const loads = makeLoads(random, loadCount);

  return {
    id: `scenario-${seed}`,
    seed,
    horizonHours: SCENARIO_HORIZON_HOURS,
    assumptions: { ...ASSUMPTIONS },
    cities: CITIES.map((city) => ({ ...city })),
    trucks,
    drivers,
    loads,
    events: [],
    activePlan: null,
    executionComplete: false,
  };
}
