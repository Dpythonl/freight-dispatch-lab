import { roundTo } from "./domain.js";

export function calculateMetrics(scenario, plan) {
  const assignments = plan.assignments ?? [];
  const loads = scenario.loads ?? [];
  const truckCount = scenario.trucks?.length ?? 0;
  const calendarDays = scenario.horizonHours > 0 ? Math.ceil(scenario.horizonHours / 24) : 0;
  const truckDays = truckCount * calendarDays;
  const availableOperatingHours = truckDays * 14;

  const emptyMiles = roundTo(assignments.reduce((sum, item) => sum + item.emptyMiles, 0), 1);
  const loadedMiles = roundTo(assignments.reduce((sum, item) => sum + item.loadedMiles, 0), 1);
  const totalMiles = roundTo(emptyMiles + loadedMiles, 1);
  const revenue = roundTo(assignments.reduce((sum, item) => sum + item.expectedRevenue, 0), 2);
  const variableCost = roundTo(assignments.reduce((sum, item) => sum + item.estimatedCost, 0), 2);
  const contribution = roundTo(assignments.reduce((sum, item) => sum + item.expectedContribution, 0), 2);
  const drivingHours = roundTo(assignments.reduce((sum, item) => sum + item.drivingHours, 0), 2);
  const onTimeDeliveries = assignments.filter((item) => item.onTime).length;

  return {
    loadsAccepted: assignments.length,
    loadsConsidered: loads.length,
    acceptanceRate: loads.length ? assignments.length / loads.length : 0,
    emptyMiles,
    loadedMiles,
    totalMiles,
    emptyMileRatio: totalMiles ? emptyMiles / totalMiles : 0,
    loadedMileRatio: totalMiles ? loadedMiles / totalMiles : 0,
    revenue,
    variableCost,
    contribution,
    costPerMile: totalMiles ? variableCost / totalMiles : 0,
    truckDays,
    revenuePerTruckDay: truckDays ? revenue / truckDays : 0,
    contributionPerTruckDay: truckDays ? contribution / truckDays : 0,
    drivingHours,
    availableOperatingHours,
    truckUtilization: availableOperatingHours ? drivingHours / availableOperatingHours : 0,
    onTimeDeliveries,
    onTimeDeliveryRate: assignments.length ? onTimeDeliveries / assignments.length : 0,
    constraintViolations: plan.violations?.length ?? 0,
  };
}
