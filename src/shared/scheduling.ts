import type { ChargingReservation, Vehicle } from '../models/entities.js';

// The operational scheduler and the What-if model use the same priority and energy rules.
export function chargingPriority(
  a: ChargingReservation,
  b: ChargingReservation,
  vehicles: Map<string, Vehicle>,
): number {
  return (
    (a.requiredBy ?? Infinity) - (b.requiredBy ?? Infinity) ||
    (vehicles.get(a.vehicleId)?.batteryLevel ?? 100) -
      (vehicles.get(b.vehicleId)?.batteryLevel ?? 100) ||
    a.createdAt - b.createdAt ||
    a.id.localeCompare(b.id)
  );
}
export function chargedBattery(
  battery: number,
  target: number,
  powerKw: number,
  capacityKWh: number,
  elapsedMs: number,
): number {
  return Math.min(target, 100, battery + ((powerKw * elapsedMs) / 3_600_000 / capacityKWh) * 100);
}
