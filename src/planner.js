import {
  AVERAGE_SPEED_MPH,
  CITY_BY_CODE,
  DRIVER_DRIVING_LIMIT_HOURS,
  DRIVER_REST_HOURS,
  DRIVER_SHIFT_LIMIT_HOURS,
  HANDLING_HOURS,
  VARIABLE_COST_PER_MILE,
  roundTo,
} from "./domain.js";
import { distanceMiles } from "./scenario.js";
import { calculateMetrics } from "./metrics.js";

export function evaluateAssignment(scenario, load, truckState, driverState) {
  const reasons = [];
  const addReason = (reason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (load.weightLb > truckState.capacityLb) addReason("Load exceeds truck capacity");
  if (load.equipmentRequired !== truckState.equipment) addReason("Required equipment is unavailable");
  if (load.qualificationRequired && !driverState.qualifications.includes(load.qualificationRequired)) {
    addReason(`Driver lacks ${load.qualificationRequired} qualification`);
  }
  if (truckState.availabilityStatus !== "available" || driverState.availabilityStatus !== "available") {
    addReason("Truck or driver is unavailable");
  }
  if (truckState.currentLocation !== driverState.currentLocation) {
    addReason("Driver and truck are not co-located");
  }

  const origin = CITY_BY_CODE.get(load.origin);
  const destination = CITY_BY_CODE.get(load.destination);
  const currentLocation = CITY_BY_CODE.get(truckState.currentLocation);
  if (!origin || !destination || !currentLocation) {
    addReason("Load or resource location is unknown");
  }

  if (reasons.length > 0) return { feasible: false, reasons };

  const emptyMiles = distanceMiles(currentLocation, origin);
  const loadedMiles = distanceMiles(origin, destination);
  const drivingHours = roundTo((emptyMiles + loadedMiles) / AVERAGE_SPEED_MPH, 2);
  const resourceReadyHour = Math.max(truckState.availableAtHour, driverState.availableAtHour);
  const emptyTravelHours = emptyMiles / AVERAGE_SPEED_MPH;
  const departureHour = Math.max(resourceReadyHour, load.pickupWindowStartHour - emptyTravelHours);
  const arrivalAtPickupHour = roundTo(departureHour + emptyMiles / AVERAGE_SPEED_MPH, 2);
  const pickupHour = Math.max(arrivalAtPickupHour, load.pickupWindowStartHour);
  const deliveryEtaHour = roundTo(pickupHour + HANDLING_HOURS + loadedMiles / AVERAGE_SPEED_MPH, 2);
  const shiftHoursRemaining = Math.min(
    driverState.hoursAvailable,
    DRIVER_DRIVING_LIMIT_HOURS,
    DRIVER_SHIFT_LIMIT_HOURS,
  );
  const shiftEndHour = departureHour + DRIVER_SHIFT_LIMIT_HOURS;

  if (pickupHour > load.pickupWindowEndHour) addReason("Pickup window cannot be met");
  if (deliveryEtaHour > load.deliveryDeadlineHour) addReason("Delivery deadline cannot be met");
  if (drivingHours > shiftHoursRemaining || deliveryEtaHour > shiftEndHour) {
    addReason("Driver hours would be exceeded");
  }
  if (deliveryEtaHour > scenario.horizonHours) addReason("Trip falls outside the scenario horizon");

  if (reasons.length > 0) return { feasible: false, reasons };

  const estimatedCost = roundTo((emptyMiles + loadedMiles) * (load.variableCostPerMile ?? VARIABLE_COST_PER_MILE), 2);
  const expectedRevenue = load.offeredRate;
  const expectedContribution = roundTo(expectedRevenue - estimatedCost, 2);
  const truckAvailableAfterHour = roundTo(deliveryEtaHour + 1, 2);
  const driverAvailableAfterHour = roundTo(deliveryEtaHour + DRIVER_REST_HOURS, 2);

  return {
    feasible: true,
    reasons: [],
    assignment: {
      id: `ASG-${load.id}-${truckState.id}`,
      loadId: load.id,
      truckId: truckState.id,
      driverId: driverState.id,
      origin: load.origin,
      destination: load.destination,
      departureHour: roundTo(departureHour, 2),
      arrivalAtPickupHour,
      pickupHour: roundTo(pickupHour, 2),
      deliveryEtaHour,
      emptyMiles,
      loadedMiles,
      totalMiles: roundTo(emptyMiles + loadedMiles, 1),
      drivingHours,
      shiftEndHour: roundTo(shiftEndHour, 2),
      estimatedCost,
      expectedRevenue,
      expectedContribution,
      onTime: deliveryEtaHour <= load.deliveryDeadlineHour,
      truckAvailableBeforeHour: truckState.availableAtHour,
      driverAvailableBeforeHour: driverState.availableAtHour,
      truckAvailableAfterHour,
      driverAvailableAfterHour,
      decisionStatus: "pending_approval",
      explanation: `${roundTo(emptyMiles, 0)} empty mi · ${roundTo(expectedContribution, 0)} expected contribution · pickup window met`,
      executionDelayHours: load.executionDelayHours,
    },
  };
}

function copyResourceState(items) {
  return new Map(items.map((item) => [item.id, structuredClone(item)]));
}

function commitAssignment(assignment, truckStates, driverStates) {
  const truck = truckStates.get(assignment.truckId);
  const driver = driverStates.get(assignment.driverId);
  truck.currentLocation = assignment.destination;
  truck.availableAtHour = assignment.truckAvailableAfterHour;
  driver.currentLocation = assignment.destination;
  driver.availableAtHour = assignment.driverAvailableAfterHour;
  driver.hoursAvailable = DRIVER_DRIVING_LIMIT_HOURS;
  driver.shiftEndHour = roundTo(driver.availableAtHour + DRIVER_SHIFT_LIMIT_HOURS, 2);
}

function rejectedEntry(load, reasons) {
  return { loadId: load.id, reasons: [...new Set(reasons)] };
}

function validateSchedule(assignments) {
  const violations = [];
  const seenLoads = new Set();
  const lastTruckRelease = new Map();
  const lastDriverRelease = new Map();

  for (const assignment of [...assignments].sort((a, b) => a.departureHour - b.departureHour || a.id.localeCompare(b.id))) {
    if (seenLoads.has(assignment.loadId)) violations.push(`Load ${assignment.loadId} is assigned more than once`);
    seenLoads.add(assignment.loadId);

    if (assignment.departureHour < (lastTruckRelease.get(assignment.truckId) ?? 0)) {
      violations.push(`Truck ${assignment.truckId} has overlapping trips`);
    }
    if (assignment.departureHour < (lastDriverRelease.get(assignment.driverId) ?? 0)) {
      violations.push(`Driver ${assignment.driverId} has overlapping trips`);
    }
    lastTruckRelease.set(assignment.truckId, assignment.truckAvailableAfterHour);
    lastDriverRelease.set(assignment.driverId, assignment.driverAvailableAfterHour);
  }

  return violations;
}

function feasibleCandidates(load, truckStates, driverStates, scenario) {
  const results = [];
  for (const truck of [...truckStates.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const driver = driverStates.get(truck.driverId);
    if (!driver) continue;
    const result = evaluateAssignment(scenario, load, truck, driver);
    if (result.feasible) results.push(result.assignment);
  }
  return results;
}

function runBaseline(scenario) {
  const truckStates = copyResourceState(scenario.trucks);
  const driverStates = copyResourceState(scenario.drivers);
  const assignments = [];
  const assigned = new Set();
  const rejectedLoads = [];
  const loads = [...scenario.loads].sort(
    (a, b) =>
      b.offeredRate - a.offeredRate ||
      a.pickupWindowStartHour - b.pickupWindowStartHour ||
      a.id.localeCompare(b.id),
  );

  for (const load of loads) {
    const candidates = feasibleCandidates(load, truckStates, driverStates, scenario);
    const candidate = candidates[0];
    if (!candidate) {
      const reasons = scenario.trucks.flatMap((truck) => {
        const driver = driverStates.get(truck.driverId);
        return evaluateAssignment(scenario, load, truckStates.get(truck.id), driver).reasons;
      });
      rejectedLoads.push(rejectedEntry(load, reasons.length ? reasons : ["No feasible truck and driver pair"]));
      continue;
    }

    candidate.explanation = "Rate-first: highest available offer rate; first feasible truck-driver pair.";
    assignments.push(candidate);
    assigned.add(load.id);
    commitAssignment(candidate, truckStates, driverStates);
  }

  return { assignments, rejectedLoads, assigned };
}

function runProfitAware(scenario) {
  const truckStates = copyResourceState(scenario.trucks);
  const driverStates = copyResourceState(scenario.drivers);
  const pending = new Map(scenario.loads.map((load) => [load.id, load]));
  const assignments = [];

  while (pending.size > 0) {
    const options = [];

    for (const load of pending.values()) {
      for (const assignment of feasibleCandidates(load, truckStates, driverStates, scenario)) {
        const score = roundTo(
          assignment.expectedContribution / Math.max(1, assignment.drivingHours) - assignment.emptyMiles * 0.03,
          4,
        );
        if (score > 0) options.push({ ...assignment, score });
      }
    }

    const earliestPickup = Math.min(...options.map((candidate) => candidate.pickupHour));
    const nearTermOptions = options.filter((candidate) => candidate.pickupHour <= earliestPickup + 1);
    const best = nearTermOptions.sort(
      (a, b) => b.score - a.score || b.expectedContribution - a.expectedContribution || a.id.localeCompare(b.id),
    )[0];
    if (!best) break;
    best.explanation = `Profit-aware: contribution per driving hour less deadhead penalty · score ${best.score}.`;
    assignments.push(best);
    pending.delete(best.loadId);
    commitAssignment(best, truckStates, driverStates);
  }

  const rejectedLoads = [...pending.values()].map((load) => {
    const candidates = feasibleCandidates(load, truckStates, driverStates, scenario);
    if (candidates.length === 0) {
      const reasons = scenario.trucks.flatMap((truck) => {
        const driver = driverStates.get(truck.driverId);
        return evaluateAssignment(scenario, load, truckStates.get(truck.id), driver).reasons;
      });
      return rejectedEntry(load, reasons.length ? reasons : ["No feasible truck and driver pair"]);
    }
    return rejectedEntry(load, ["Expected contribution does not justify the operating time and deadhead"]);
  });

  return { assignments, rejectedLoads };
}

export function planScenario(scenario, strategy) {
  if (strategy !== "baseline" && strategy !== "profit-aware") {
    throw new RangeError("Strategy must be 'baseline' or 'profit-aware'.");
  }

  const result = strategy === "baseline" ? runBaseline(scenario) : runProfitAware(scenario);
  const violations = validateSchedule(result.assignments);
  const plan = {
    strategy,
    assignments: result.assignments,
    rejectedLoads: result.rejectedLoads,
    violations,
  };
  plan.metrics = calculateMetrics(scenario, plan);
  return plan;
}
