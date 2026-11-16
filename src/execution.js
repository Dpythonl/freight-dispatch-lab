import { DRIVER_REST_HOURS, roundTo } from "./domain.js";
import { AppError } from "./errors.js";
import { calculateMetrics } from "./metrics.js";

function recordEvent(scenario, type, entityType, entityId, atHour, location, message) {
  const event = {
    id: `EVT-${String(scenario.events.length + 1).padStart(4, "0")}`,
    type,
    entityType,
    entityId,
    atHour: roundTo(atHour, 2),
    location,
    message,
  };
  scenario.events.push(event);
  return event;
}

export function addScenarioEvent(scenario, type, entityType, entityId, message) {
  return recordEvent(scenario, type, entityType, entityId, 0, null, message);
}

export function approveAssignments(state, assignmentIds) {
  if (!state.activePlan) throw new AppError("Run a dispatch plan before approving assignments.", 409);
  if (state.executionComplete) throw new AppError("This plan has already been simulated.", 409);
  if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
    throw new AppError("Choose at least one assignment to approve.", 400);
  }

  const next = structuredClone(state);
  const assignments = new Map(next.activePlan.assignments.map((assignment) => [assignment.id, assignment]));
  const unknownIds = [...new Set(assignmentIds)].filter((id) => !assignments.has(id));
  if (unknownIds.length > 0) throw new AppError(`Unknown assignment: ${unknownIds[0]}`, 400);

  const loads = new Map(next.scenario.loads.map((load) => [load.id, load]));
  const seenLoadIds = new Set();
  for (const assignment of next.activePlan.assignments) {
    if (seenLoadIds.has(assignment.loadId)) {
      throw new AppError(`Load ${assignment.loadId} appears more than once in this plan.`, 409);
    }
    seenLoadIds.add(assignment.loadId);
  }

  for (const assignmentId of new Set(assignmentIds)) {
    const assignment = assignments.get(assignmentId);
    if (assignment.decisionStatus === "approved") continue;
    if (assignment.decisionStatus !== "pending_approval") {
      throw new AppError(`Assignment ${assignmentId} cannot be approved from ${assignment.decisionStatus}.`, 409);
    }
    assignment.decisionStatus = "approved";
    const load = loads.get(assignment.loadId);
    if (!load || load.status !== "offered") {
      throw new AppError(`Load ${assignment.loadId} is no longer available.`, 409);
    }
    load.status = "accepted";
    recordEvent(
      next.scenario,
      "assignment_approved",
      "assignment",
      assignment.id,
      assignment.departureHour,
      assignment.origin,
      `Approved ${assignment.loadId} for ${assignment.truckId} and ${assignment.driverId}.`,
    );
  }

  return next;
}

export function simulateApprovedAssignments(state) {
  if (!state.activePlan) throw new AppError("Run a dispatch plan before starting execution.", 409);
  const approved = state.activePlan.assignments.filter((assignment) => assignment.decisionStatus === "approved");
  if (approved.length === 0) throw new AppError("No approved assignments are ready to simulate.", 409);

  const next = structuredClone(state);
  const loads = new Map(next.scenario.loads.map((load) => [load.id, load]));
  const trucks = new Map(next.scenario.trucks.map((truck) => [truck.id, truck]));
  const drivers = new Map(next.scenario.drivers.map((driver) => [driver.id, driver]));

  const orderedAssignments = next.activePlan.assignments
    .filter((assignment) => assignment.decisionStatus === "approved")
    .sort((a, b) => a.departureHour - b.departureHour || a.id.localeCompare(b.id));

  for (const assignment of orderedAssignments) {
    const load = loads.get(assignment.loadId);
    const truck = trucks.get(assignment.truckId);
    const driver = drivers.get(assignment.driverId);
    if (!load || !truck || !driver) throw new AppError(`Assignment ${assignment.id} has missing resources.`, 409);
    if (load.status !== "accepted") throw new AppError(`Load ${load.id} is not approved for execution.`, 409);

    assignment.decisionStatus = "in_transit";
    load.status = "in_transit";
    truck.availabilityStatus = "on_route";
    driver.availabilityStatus = "on_route";
    recordEvent(
      next.scenario,
      "trip_departed",
      "assignment",
      assignment.id,
      assignment.departureHour,
      assignment.origin,
      `${assignment.truckId} departed for ${assignment.loadId}.`,
    );

    load.status = "picked_up";
    assignment.actualPickupHour = assignment.pickupHour;
    recordEvent(
      next.scenario,
      "pickup_completed",
      "load",
      load.id,
      assignment.actualPickupHour,
      load.origin,
      `${load.id} was picked up within its window.`,
    );

    assignment.actualDeliveryHour = roundTo(assignment.deliveryEtaHour + (load.executionDelayHours ?? 0), 2);
    assignment.actualDelayHours = load.executionDelayHours ?? 0;
    assignment.onTime = assignment.actualDeliveryHour <= load.deliveryDeadlineHour;
    assignment.decisionStatus = assignment.onTime ? "delivered" : "delivered_late";
    load.status = assignment.decisionStatus;
    load.actualDeliveryHour = assignment.actualDeliveryHour;

    truck.currentLocation = load.destination;
    truck.availableAtHour = roundTo(assignment.actualDeliveryHour + 1, 2);
    truck.availabilityStatus = "available";
    truck.odometerMiles = roundTo((truck.odometerMiles ?? 0) + assignment.totalMiles, 1);
    driver.currentLocation = load.destination;
    driver.availableAtHour = roundTo(assignment.actualDeliveryHour + DRIVER_REST_HOURS, 2);
    driver.shiftEndHour = roundTo(driver.availableAtHour + 14, 2);
    driver.availabilityStatus = "available";

    recordEvent(
      next.scenario,
      assignment.onTime ? "delivery_completed" : "delivery_late",
      "load",
      load.id,
      assignment.actualDeliveryHour,
      load.destination,
      assignment.onTime
        ? `${load.id} delivered on time.`
        : `${load.id} delivered ${roundTo(assignment.actualDeliveryHour - load.deliveryDeadlineHour, 1)} hours late.`,
    );
  }

  const completedAssignments = next.activePlan.assignments.filter((assignment) =>
    ["delivered", "delivered_late"].includes(assignment.decisionStatus),
  );
  next.actualMetrics = calculateMetrics(next.scenario, {
    assignments: completedAssignments,
    violations: next.activePlan.violations,
  });
  next.executionComplete = next.activePlan.assignments.every((assignment) =>
    ["delivered", "delivered_late", "cancelled"].includes(assignment.decisionStatus),
  );

  return next;
}
