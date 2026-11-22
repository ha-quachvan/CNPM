import { ChargingReservation, ChargingSession } from '../models/entities.js';
import {
  ReservationKind,
  ReservationStatus,
  ChargingSessionStatus,
  VehicleStatus,
  PortStatus,
  HubStatus,
  Role,
} from '../models/enums.js';
import type { ChargeRequestDTO, NetworkState } from '../models/types.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import {
  actor,
  canCharge,
  activeHub,
  held,
  powerUsed,
  fault,
  restorePort,
  restoreVehicle,
  connected,
  notify,
} from '../shared/business.js';
import { chargingPriority, chargedBattery } from '../shared/scheduling.js';
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
      const h = activeHub(s, data.hubId);
      const v = must(s.vehicles, data.vehicleId, 'Xe');
      canCharge(s, userId, v);
      ensure(
        v.currentHubId === h.id &&
          v.parkingSpaceId &&
          v.status === VehicleStatus.AVAILABLE &&
          data.targetBattery > v.batteryLevel,
        'ValidationError',
        'Xe phải đang đỗ, sẵn sàng và pin mục tiêu lớn hơn pin hiện tại.',
        400,
      );
      ensure(
        ![...s.reservations.values()].some((r) => r.vehicleId === v.id && held(r)) &&
          !connected(s, v.id),
        'ResourceConflict',
        'Xe đã có yêu cầu hoặc còn kết nối với cổng sạc.',
      );
      if (data.portId)
        ensure(
          must(s.ports, data.portId, 'Cổng sạc').hubId === h.id,
          'ValidationError',
          'Cổng ưu tiên không thuộc Hub của xe.',
          400,
        );
      const r = new ChargingReservation({
        id: id('res'),
        kind: ReservationKind.CHARGING,
        userId,
        hubId: h.id,
        createdAt: this.now(),
        expiresAt: this.now() + config.waitingMinutes * minute,
        status: ReservationStatus.WAITING,
        extensionCount: 0,
        vehicleId: v.id,
        preferredPortId: data.portId,
        targetBattery: data.targetBattery,
        requiredBy: data.requiredBy,
        waitingReason: 'Đang chờ bộ lập lịch phân bổ.',
      });
      s.reservations.set(r.id, r);
      return r;
    });
  }
  start(userId: string, reservationId: string): ChargingSession {
    return this.repo.transact((s) => {
      const r = this.authorize(s, userId, reservationId);
      ensure(
        r.status === ReservationStatus.HELD && r.expiresAt > this.now() && r.portId,
        'InvalidReservationState',
        'Cổng chưa được cấp hoặc yêu cầu đã hết hạn.',
      );
      activeHub(s, r.hubId);
      const v = must(s.vehicles, r.vehicleId);
      const p = must(s.ports, r.portId);
      ensure(
        v.currentHubId === r.hubId &&
          v.parkingSpaceId &&
          p.status === PortStatus.HELD &&
          !fault(s, 'VEHICLE', v.id) &&
          !fault(s, 'CHARGING_PORT', p.id) &&
          !connected(s, v.id),
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
  stop(userId: string, sessionId: string): ChargingSession {
    this.advance(this.now());
    return this.repo.transact((s) => {
      const c = must(s.chargingSessions, sessionId, 'Phiên sạc');
      const r = this.authorize(s, userId, c.reservationId);
      if (c.status === ChargingSessionStatus.AWAITING_DISCONNECT) return c;
      ensure(
        c.status === ChargingSessionStatus.ACTIVE,
        'InvalidChargingState',
        'Phiên sạc không còn hoạt động.',
      );
      c.status = ChargingSessionStatus.AWAITING_DISCONNECT;
      c.stoppedAt = this.now();
      c.stopReason = 'MANUAL';
      restorePort(s, c.portId);
      notify(
        s,
        r.userId,
        'CHARGE_STOPPED',
        'Đã dừng sạc',
        `Xe ${must(s.vehicles, c.vehicleId).code} đã ngừng cấp điện. Hãy ngắt kết nối để giải phóng cổng.`,
        this.now(),
        c.id,
      );
      return c;
    });
  }
  disconnect(userId: string, sessionId: string): ChargingSession {
    return this.repo.transact((s) => {
      const c = must(s.chargingSessions, sessionId, 'Phiên sạc');
      const r = this.authorize(s, userId, c.reservationId);
      if ([ChargingSessionStatus.COMPLETED, ChargingSessionStatus.CANCELLED].includes(c.status))
        return c;
      ensure(
        c.status === ChargingSessionStatus.AWAITING_DISCONNECT,
        'InvalidChargingState',
        'Hãy dừng sạc trước khi ngắt kết nối.',
      );
      c.status =
        c.stopReason === 'MANUAL'
          ? ChargingSessionStatus.CANCELLED
          : ChargingSessionStatus.COMPLETED;
      c.endedAt = this.now();
      r.status = ReservationStatus.COMPLETED;
      restorePort(s, c.portId);
      restoreVehicle(s, must(s.vehicles, c.vehicleId));
      notify(
        s,
        r.userId,
        'CHARGE_DISCONNECTED',
        'Đã ngắt kết nối sạc',
        'Cổng sạc đã được giải phóng. Bạn có thể lấy xe hoặc tiếp tục gửi xe.',
        this.now(),
        c.id,
      );
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
        .sort((a, b) => chargingPriority(a, b, s.vehicles));
      for (const r of queue) {
        const v = must(s.vehicles, r.vehicleId);
        const h = must(s.hubs, r.hubId);
        if (
          h.status !== HubStatus.ACTIVE ||
          v.currentHubId !== h.id ||
          !v.parkingSpaceId ||
          fault(s, 'VEHICLE', v.id) ||
          connected(s, v.id) ||
          v.batteryLevel >= r.targetBattery
        ) {
          r.waitingReason = 'Xe hoặc Hub hiện chưa đủ điều kiện sạc.';
          continue;
        }
        const free = [...s.ports.values()].filter(
          (p) =>
            p.hubId === h.id &&
            p.status === PortStatus.FREE &&
            !fault(s, 'CHARGING_PORT', p.id) &&
            (!r.preferredPortId || p.id === r.preferredPortId),
        );
        const p = free.find((p) => powerUsed(s, h.id) + p.powerKw <= h.chargingBudgetKw);
        if (!p) {
          r.waitingReason = free.length
            ? 'Chưa đủ ngân sách công suất; hệ thống sẽ cấp khi có nguồn lực.'
            : 'Chưa có cổng phù hợp; yêu cầu đang được xếp theo ưu tiên.';
          continue;
        }
        r.portId = p.id;
        r.status = ReservationStatus.HELD;
        r.expiresAt = now + config.holdMinutes * minute;
        r.waitingReason = undefined;
        p.status = PortStatus.HELD;
        notify(
          s,
          r.userId,
          'CHARGE_ALLOCATED',
          'Đã có cổng sạc cho bạn',
          `Cổng ${p.id} tại ${h.name} được giữ ${config.holdMinutes} phút. Hãy bắt đầu sạc trước khi hết hạn.`,
          now,
          r.id,
        );
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
          if (
            fault(s, 'VEHICLE', v.id) ||
            fault(s, 'CHARGING_PORT', p.id) ||
            p.status === PortStatus.FAULT
          )
            continue;
          v.batteryLevel = chargedBattery(
            v.batteryLevel,
            c.targetBattery,
            p.powerKw,
            v.capacityKWh,
            elapsed,
          );
          updated++;
          if (v.batteryLevel >= c.targetBattery) {
            c.status = ChargingSessionStatus.AWAITING_DISCONNECT;
            c.stoppedAt = now;
            c.stopReason = 'TARGET';
            restorePort(s, p.id);
            const r = must(s.reservations, c.reservationId);
            notify(
              s,
              r.userId,
              'CHARGE_TARGET',
              'Xe đã sạc đạt mục tiêu',
              `Xe ${v.code} đã đạt ${c.targetBattery}%. Hãy xác nhận ngắt kết nối; cổng vẫn được giữ đến lúc đó.`,
              now,
              c.id,
            );
          }
        }
      return updated;
    });
  }
  private authorize(s: NetworkState, userId: string, reservationId: string): ChargingReservation {
    const u = actor(s, userId, [Role.CUSTOMER, Role.OPERATOR]);
    const r = must(s.reservations, reservationId, 'Yêu cầu sạc');
    ensure(
      r.kind === ReservationKind.CHARGING,
      'InvalidReservationState',
      'Bản đặt không phải yêu cầu sạc.',
    );
    ensure(
      r.userId === userId || u.role === Role.OPERATOR,
      'Forbidden',
      'Bạn không có quyền quản lý phiên sạc này.',
      403,
    );
    return r;
  }
}
