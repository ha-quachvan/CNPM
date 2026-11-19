import { NetworkSnapshot, Scenario, SimulationResult } from '../models/entities.js';
import { PortStatus, ScenarioType, SpaceStatus } from '../models/enums.js';
import { config } from '../shared/config.js';
import { must, ensure } from '../shared/errors.js';
import { freeVehicle } from '../shared/business.js';
export class WhatIfEngine {
  constructor(
    private timeoutMs = config.simulationTimeoutMs,
    private now = Date.now,
  ) {}
  simulate(snapshot: NetworkSnapshot, scenario: Scenario): SimulationResult {
    const start = performance.now();
    const s = structuredClone(snapshot.state);
    const h = must(s.hubs, scenario.targetHubId);
    const params = scenario.parameters;
    let seed = scenario.seed >>> 0;
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const spaces = [...s.spaces.values()].filter((p) => p.hubId === h.id);
    let vehicles = [...s.vehicles.values()].filter(
      (v) => v.currentHubId === h.id && freeVehicle(s, v),
    ).length;
    const baselineVehicles = vehicles;
    let occupied = spaces.filter((p) => p.status !== SpaceStatus.FREE).length;
    let demandMultiplier = 1;
    let chargingMultiplier = 1;
    if (scenario.type === ScenarioType.DEMAND_SURGE)
      demandMultiplier = params.get('multiplier') ?? 2;
    if (scenario.type === ScenarioType.HUB_FULL)
      occupied = Math.min(
        spaces.length,
        occupied + (params.get('additionalVehicles') ?? spaces.length),
      );
    if (scenario.type === ScenarioType.VEHICLE_IMBALANCE)
      vehicles = Math.max(0, vehicles - (params.get('vehicleLoss') ?? Math.ceil(vehicles / 2)));
    if (scenario.type === ScenarioType.CHARGING_SURGE)
      chargingMultiplier = params.get('multiplier') ?? 3;
    const ports = [...s.ports.values()].filter((p) => p.hubId === h.id);
    if (scenario.type === ScenarioType.PORT_FAILURE)
      ports.slice(0, params.get('failedPorts') ?? 1).forEach((p) => (p.status = PortStatus.FAULT));
    let demand = 0;
    let chargingDemand = 0;
    for (let m = 0; m < scenario.horizonMinutes; m++) {
      ensure(
        performance.now() - start < this.timeoutMs,
        'SimulationTimeout',
        'Mô phỏng vượt giới hạn thời gian.',
        408,
      );
      demand += demandMultiplier * (0.1 + random() * 0.08);
      chargingDemand += chargingMultiplier * (0.03 + random() * 0.02);
    }
    const predictedDemand = Math.round(demand);
    const freePorts = ports.filter((p) => p.status === PortStatus.FREE).length;
    const unserved = Math.max(0, predictedDemand - vehicles);
    const waiting = Math.max(0, Math.round(chargingDemand) - freePorts);
    const recommendations = [];
    if (unserved)
      recommendations.push(
        `Cân nhắc điều phối thêm ${unserved} xe đến ${h.name} để đáp ứng nhu cầu giả định.`,
      );
    if (occupied >= spaces.length)
      recommendations.push('Hub có nguy cơ đầy chỗ: ưu tiên chuyển bớt xe sang Hub còn sức chứa.');
    if (waiting)
      recommendations.push(
        `Khoảng ${waiting} yêu cầu sạc có thể phải chờ; phân bổ theo thời điểm cần xe và mức pin.`,
      );
    if (scenario.type === ScenarioType.PORT_FAILURE)
      recommendations.push(
        'Ưu tiên kỹ thuật viên kiểm tra cổng lỗi; phân bổ lại công suất cho cổng còn hoạt động.',
      );
    if (!recommendations.length)
      recommendations.push('Nguồn lực hiện tại đáp ứng kịch bản trong mô hình mô phỏng.');
    return new SimulationResult({
      scenarioId: scenario.id,
      generatedAt: this.now(),
      metrics: new Map(
        Object.entries({
          baselineVehicles,
          availableVehicles: vehicles,
          predictedDemand,
          estimatedUnserved: unserved,
          parkingOccupancy: spaces.length ? Math.round((occupied / spaces.length) * 100) : 0,
          availablePorts: freePorts,
          waitingCharges: waiting,
          horizonMinutes: scenario.horizonMinutes,
        }),
      ),
      recommendations,
    });
  }
}
