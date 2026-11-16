export const DEFAULT_TRUCK_COUNT = 20;
export const DEFAULT_LOAD_COUNT = 100;
export const SCENARIO_HORIZON_HOURS = 120;
export const ROAD_DISTANCE_FACTOR = 1.22;
export const AVERAGE_SPEED_MPH = 52;
export const HANDLING_HOURS = 0.5;
export const DRIVER_DRIVING_LIMIT_HOURS = 11;
export const DRIVER_SHIFT_LIMIT_HOURS = 14;
export const DRIVER_REST_HOURS = 10;
export const VARIABLE_COST_PER_MILE = 1.7;

export const EQUIPMENT_TYPES = Object.freeze(["dry_van", "reefer", "flatbed"]);

export const CITIES = Object.freeze([
  { code: "ATL", name: "Atlanta", state: "GA", lat: 33.749, lon: -84.388 },
  { code: "BHM", name: "Birmingham", state: "AL", lat: 33.5186, lon: -86.8104 },
  { code: "CLT", name: "Charlotte", state: "NC", lat: 35.2271, lon: -80.8431 },
  { code: "CHI", name: "Chicago", state: "IL", lat: 41.8781, lon: -87.6298 },
  { code: "CIN", name: "Cincinnati", state: "OH", lat: 39.1031, lon: -84.512 },
  { code: "CLE", name: "Cleveland", state: "OH", lat: 41.4993, lon: -81.6944 },
  { code: "CLT2", name: "Chattanooga", state: "TN", lat: 35.0456, lon: -85.3097 },
  { code: "CMH", name: "Columbus", state: "OH", lat: 39.9612, lon: -82.9988 },
  { code: "DAL", name: "Dallas", state: "TX", lat: 32.7767, lon: -96.797 },
  { code: "DET", name: "Detroit", state: "MI", lat: 42.3314, lon: -83.0458 },
  { code: "HOU", name: "Houston", state: "TX", lat: 29.7604, lon: -95.3698 },
  { code: "IND", name: "Indianapolis", state: "IN", lat: 39.7684, lon: -86.1581 },
  { code: "JAX", name: "Jacksonville", state: "FL", lat: 30.3322, lon: -81.6557 },
  { code: "KC", name: "Kansas City", state: "MO", lat: 39.0997, lon: -94.5786 },
  { code: "LOU", name: "Louisville", state: "KY", lat: 38.2527, lon: -85.7585 },
  { code: "MEM", name: "Memphis", state: "TN", lat: 35.1495, lon: -90.049 },
  { code: "MKE", name: "Milwaukee", state: "WI", lat: 43.0389, lon: -87.9065 },
  { code: "NSH", name: "Nashville", state: "TN", lat: 36.1627, lon: -86.7816 },
  { code: "RDU", name: "Raleigh", state: "NC", lat: 35.7796, lon: -78.6382 },
  { code: "STL", name: "St. Louis", state: "MO", lat: 38.627, lon: -90.1994 },
  { code: "TPA", name: "Tampa", state: "FL", lat: 27.9506, lon: -82.4572 },
  { code: "TUL", name: "Tulsa", state: "OK", lat: 36.154, lon: -95.9928 },
  { code: "LIT", name: "Little Rock", state: "AR", lat: 34.7465, lon: -92.2896 },
  { code: "OKC", name: "Oklahoma City", state: "OK", lat: 35.4676, lon: -97.5164 },
]);

export const CITY_BY_CODE = new Map(CITIES.map((city) => [city.code, city]));

export const ASSUMPTIONS = Object.freeze({
  dataSource: "Synthetic scenario; no real carrier or broker data",
  roadDistanceFactor: ROAD_DISTANCE_FACTOR,
  averageSpeedMph: AVERAGE_SPEED_MPH,
  handlingHours: HANDLING_HOURS,
  variableCostPerMile: VARIABLE_COST_PER_MILE,
  driverDrivingLimitHours: DRIVER_DRIVING_LIMIT_HOURS,
  driverShiftLimitHours: DRIVER_SHIFT_LIMIT_HOURS,
  driverRestHours: DRIVER_REST_HOURS,
  scenarioHorizonHours: SCENARIO_HORIZON_HOURS,
});

export function createSeededRandom(seed) {
  let state = seed >>> 0;

  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function choose(random, values) {
  return values[Math.floor(random() * values.length)];
}

export function integerBetween(random, minimum, maximum) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

export function roundTo(value, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}
