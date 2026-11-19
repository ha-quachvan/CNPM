import { DeviceCommand, VehicleStatus } from '../models/enums.js';
import type { Vehicle } from '../models/entities.js';
import type { Telemetry, ResourceRef, DeviceResult } from '../models/types.js';
import { must } from '../shared/errors.js';
export class DeviceSimulator {
  private telemetry = new Map<string, Telemetry>();
  private commandResults = new Map<string, DeviceResult>();
  constructor(
    vehicles: Vehicle[],
    private now = Date.now,
  ) {
    for (const v of vehicles)
      this.telemetry.set(v.id, {
        position: { lat: 10.88, lng: 106.8, hubId: v.currentHubId },
        batteryLevel: v.batteryLevel,
        locked: v.status !== VehicleStatus.IN_USE,
      });
  }
  readTelemetry(vehicleId: string): Telemetry {
    return structuredClone(must(this.telemetry, vehicleId, 'Dữ liệu mô phỏng'));
  }
  execute(target: ResourceRef, command: DeviceCommand): DeviceResult {
    const result = this.commandResults.get(`${target.kind}:${target.id}:${command}`);
    return {
      success: result?.success ?? true,
      errorCode: result?.errorCode,
      observedAt: this.now(),
    };
  }
  // Demo adapters change observations/results, never repository business state.
  setTelemetry(vehicleId: string, value: Telemetry): void {
    this.telemetry.set(vehicleId, structuredClone(value));
  }
  setCommandResult(target: ResourceRef, command: DeviceCommand, success: boolean): void {
    this.commandResults.set(`${target.kind}:${target.id}:${command}`, {
      success,
      errorCode: success ? undefined : 'SIMULATED_FAILURE',
      observedAt: this.now(),
    });
  }
}
