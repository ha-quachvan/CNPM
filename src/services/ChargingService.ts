import { ChargingReservation, ChargingSession } from '../models/entities.js';
import {
  ReservationKind,
  ReservationStatus,
  ChargingSessionStatus,
  VehicleStatus,
  PortStatus,
  HubStatus,
} from '../models/enums.js';
import type { ChargeRequestDTO } from '../models/types.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import {
  customer,
  canCharge,
  activeHub,
  held,
  powerUsed,
  fault,
  restorePort,
  restoreVehicle,
} from '../shared/business.js';
import { ensure, must, numeric } from '../shared/errors.js';
import { config, minute } from '../shared/config.js';
import { id } from '../shared/security.js';
export class ChargingService {
  constructor(
    private repo: InMemoryRepository,
    private now = Date.now,
  ) {}
  request(userId: string, data: ChargeRequestDTO): ChargingReservation {
    numeric(data.targetBattery, 'Pin mục tiêu', 1, 100);
    if (data.requiredBy !== undefined)
      numeric(
        data.requiredBy,
        'Thời điểm cần xe',
        this.now() + 1,
        this.now() + 7 * 24 * 60 * minute,
      );
    return this.repo.transact((s) => {
      customer(s, userId);
      const h = activeHub(s, data.hubId);
      const v = must(s.vehicles, data.vehicleId, 'Xe');
      canCharge(s, userId, v);
      ensure(
        v.currentHubId === h.id && v.parkingSpaceId && data.targetBattery > v.batteryLevel,
        'ValidationError',
        'Xe phải đang ở Hub đã chọn và pin mục tiêu lớn hơn pin hiện tại.',
        400,
      );
      ensure(
        ![...s.reservations.values()].some(
          (r) => r.vehicleId === v.id && held(r) && r.expiresAt > this.now(),
        ) &&
          ![...s.chargingSessions.values()].some(
            (c) => c.vehicleId === v.id && c.status === ChargingSessionStatus.ACTIVE,
          ),
        'ResourceConflict',
        'Xe đã có yêu cầu hoặc phiên đang hoạt động.',
      );
      if (data.portId) {
        const p = must(s.ports, data.portId, 'Cổng sạc');
        ensure(
          p.hubId === h.id &&
            p.status === PortStatus.FREE &&
            !fault(s, 'CHARGING_PORT', p.id) &&
            powerUsed(s, h.id) + p.powerKw <= h.chargingBudgetKw,
          'ResourceConflict',
          'Cổng không khả dụng hoặc vượt ngân sách công suất.',
        );
        p.status = PortStatus.HELD;
      }
      const r = new ChargingReservation({
        id: id('res'),
        kind: ReservationKind.CHARGING,
        userId,
        hubId: h.id,
        createdAt: this.now(),
        expiresAt: this.now() + (data.portId ? config.holdMinutes : config.waitingMinutes) * minute,
        status: data.portId ? ReservationStatus.HELD : ReservationStatus.WAITING,
        extensionCount: 0,
        vehicleId: v.id,
        portId: data.portId,
        targetBattery: data.targetBattery,
        requiredBy: data.requiredBy,
      });
      s.reservations.set(r.id, r);
      return r;
    });
  }
  start(userId: string, reservationId: string): ChargingSession {
    return this.repo.transact((s) => {
      customer(s, userId);
      const r = must(s.reservations, reservationId);
      ensure(r.userId === userId, 'Forbidden', 'Yêu cầu không thuộc tài khoản này.', 403);
      ensure(
        r.kind === ReservationKind.CHARGING &&
          r.status === ReservationStatus.HELD &&
          r.expiresAt > this.now() &&
          r.portId,
        'InvalidReservationState',
        'Cổng chưa được cấp hoặc yêu cầu đã hết hạn.',
      );
      activeHub(s, r.hubId);
      const v = must(s.vehicles, r.vehicleId);
      canCharge(s, userId, v);
      const p = must(s.ports, r.portId);
      ensure(
        v.currentHubId === r.hubId &&
          p.hubId === r.hubId &&
          p.status === PortStatus.HELD &&
          !fault(s, 'CHARGING_PORT', p.id) &&
          ![...s.chargingSessions.values()].some(
            (c) =>
              c.status === ChargingSessionStatus.ACTIVE &&
              (c.portId === p.id || c.vehicleId === v.id),
          ),
        'ResourceConflict',
        'Xe hoặc cổng không sẵn sàng để bắt đầu sạc.',
      );
      const c = new ChargingSession({
        id: id('charge'),
        reservationId: r.id,
        vehicleId: v.id,
        portId: p.id,
        startedAt: this.now(),
        updatedAt: this.now(),
        targetBattery: r.targetBattery,
        status: ChargingSessionStatus.ACTIVE,
      });
      s.chargingSessions.set(c.id, c);
      r.status = ReservationStatus.CONFIRMED;
      p.status = PortStatus.CHARGING;
      v.status = VehicleStatus.CHARGING;
      return c;
    });
  }
  schedule(now: number): number {
    return this.repo.transact((s) => {
      let count = 0;
      const queue = [...s.reservations.values()]
        .filter(
          (r): r is ChargingReservation =>
            r.kind === ReservationKind.CHARGING &&
            r.status === ReservationStatus.WAITING &&
            r.expiresAt > now,
        )
        .sort(
          (a, b) =>
            (a.requiredBy ?? Infinity) - (b.requiredBy ?? Infinity) ||
            must(s.vehicles, a.vehicleId).batteryLevel -
              must(s.vehicles, b.vehicleId).batteryLevel ||
            a.createdAt - b.createdAt,
        );
      for (const r of queue) {
        const v = must(s.vehicles, r.vehicleId);
        const h = must(s.hubs, r.hubId);
        if (
          h.status !== HubStatus.ACTIVE ||
          v.currentHubId !== h.id ||
          fault(s, 'VEHICLE', v.id) ||
          v.status === VehicleStatus.CHARGING ||
          v.batteryLevel >= r.targetBattery
        )
          continue;
        const p = [...s.ports.values()].find(
          (p) =>
            p.hubId === h.id &&
            p.status === PortStatus.FREE &&
            !fault(s, 'CHARGING_PORT', p.id) &&
            powerUsed(s, h.id) + p.powerKw <= h.chargingBudgetKw,
        );
        if (!p) continue;
        r.portId = p.id;
        r.status = ReservationStatus.HELD;
        r.expiresAt = now + config.holdMinutes * minute;
        p.status = PortStatus.HELD;
        count++;
      }
      return count;
    });
  }
  advance(now: number): number {
    return this.repo.transact((s) => {
      let updated = 0;
      for (const c of s.chargingSessions.values())
        if (c.status === ChargingSessionStatus.ACTIVE && now > c.updatedAt) {
          const v = must(s.vehicles, c.vehicleId);
          const p = must(s.ports, c.portId);
          const elapsed = now - c.updatedAt;
          c.updatedAt = now;
          if (fault(s, 'VEHICLE', v.id) || fault(s, 'CHARGING_PORT', p.id)) continue;
          v.batteryLevel = Math.min(
            100,
            c.targetBattery,
            v.batteryLevel + ((p.powerKw * elapsed) / 3_600_000 / v.capacityKWh) * 100,
          );
          updated++;
          if (v.batteryLevel >= c.targetBattery) {
            c.status = ChargingSessionStatus.COMPLETED;
            c.endedAt = now;
            must(s.reservations, c.reservationId).status = ReservationStatus.COMPLETED;
            restorePort(s, p.id);
            restoreVehicle(s, v);
          }
        }
      return updated;
    });
  }
}
