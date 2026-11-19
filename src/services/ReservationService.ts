import { VehicleReservation, ParkingReservation, Reservation } from '../models/entities.js';
import {
  ReservationKind,
  ReservationStatus,
  VehicleStatus,
  SpaceStatus,
  PortStatus,
  VehicleOwnership,
  RentalStatus,
  ChargingSessionStatus,
} from '../models/enums.js';
import type { ParkingRequestDTO } from '../models/types.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import { config, minute } from '../shared/config.js';
import { ensure, must, numeric } from '../shared/errors.js';
import { id } from '../shared/security.js';
import {
  customer,
  activeHub,
  freeVehicle,
  held,
  releaseReservation,
  powerUsed,
  fault,
} from '../shared/business.js';
export class ReservationService {
  constructor(
    private repo: InMemoryRepository,
    private now = Date.now,
  ) {}
  reserveVehicle(userId: string, vehicleId: string): VehicleReservation {
    this.expire(this.now());
    return this.repo.transact((s) => {
      customer(s, userId);
      const v = must(s.vehicles, vehicleId, 'Xe');
      activeHub(s, v.currentHubId!);
      ensure(
        ![...s.reservations.values()].some(
          (r) => r.userId === userId && r.kind === ReservationKind.VEHICLE && held(r),
        ) &&
          ![...s.rentals.values()].some(
            (r) => r.userId === userId && r.status === RentalStatus.ACTIVE,
          ),
        'NotEligible',
        'Bạn đang giữ hoặc sử dụng một xe khác.',
      );
      ensure(
        freeVehicle(s, v),
        'ResourceConflict',
        'Xe đã được giữ hoặc không đủ điều kiện sử dụng.',
      );
      const r = new VehicleReservation({
        id: id('res'),
        kind: ReservationKind.VEHICLE,
        userId,
        hubId: v.currentHubId!,
        createdAt: this.now(),
        expiresAt: this.now() + config.holdMinutes * minute,
        status: ReservationStatus.HELD,
        extensionCount: 0,
        vehicleId,
        pickupCode: String(Math.floor(100000 + Math.random() * 900000)),
      });
      s.reservations.set(r.id, r);
      v.status = VehicleStatus.RESERVED;
      return r;
    });
  }
  reserveParking(userId: string, data: ParkingRequestDTO): ParkingReservation {
    this.expire(this.now());
    return this.repo.transact((s) => {
      customer(s, userId);
      activeHub(s, data.hubId);
      const v = must(s.vehicles, data.vehicleId, 'Xe');
      const p = must(s.spaces, data.spaceId, 'Chỗ đỗ');
      ensure(
        v.ownership === VehicleOwnership.PERSONAL && v.ownerId === userId,
        'Forbidden',
        'Chỉ đặt chỗ cho xe cá nhân của bạn.',
        403,
      );
      ensure(
        !v.parkingSpaceId &&
          ![...s.reservations.values()].some((r) => r.vehicleId === v.id && held(r)),
        'ResourceConflict',
        'Xe đang đỗ hoặc có yêu cầu còn hiệu lực.',
      );
      ensure(
        p.hubId === data.hubId && p.status === SpaceStatus.FREE && !s.dispatchSpaceHolds.has(p.id),
        'ResourceConflict',
        'Chỗ đỗ không còn trống.',
      );
      const r = new ParkingReservation({
        id: id('res'),
        kind: ReservationKind.PARKING,
        userId,
        hubId: data.hubId,
        createdAt: this.now(),
        expiresAt: this.now() + config.holdMinutes * minute,
        status: ReservationStatus.HELD,
        extensionCount: 0,
        vehicleId: v.id,
        spaceId: p.id,
      });
      s.reservations.set(r.id, r);
      p.status = SpaceStatus.HELD;
      return r;
    });
  }
  cancel(userId: string, reservationId: string): void {
    this.expire(this.now());
    this.repo.transact((s) => {
      customer(s, userId);
      const r = must(s.reservations, reservationId, 'Bản đặt');
      ensure(r.userId === userId, 'Forbidden', 'Bản đặt không thuộc tài khoản này.', 403);
      ensure(held(r), 'InvalidReservationState', 'Bản đặt không còn được hủy.');
      r.status = ReservationStatus.CANCELLED;
      releaseReservation(s, r);
    });
  }
  extend(userId: string, reservationId: string, extraMinutes: number): Reservation {
    numeric(extraMinutes, 'Số phút gia hạn', 1, config.maxExtensionMinutes);
    this.expire(this.now());
    return this.repo.transact((s) => {
      customer(s, userId);
      const r = must(s.reservations, reservationId);
      ensure(r.userId === userId, 'Forbidden', 'Bản đặt không thuộc tài khoản này.', 403);
      ensure(
        r.kind !== ReservationKind.VEHICLE &&
          held(r) &&
          r.expiresAt > this.now() &&
          r.extensionCount < config.maxExtensions,
        'InvalidReservationState',
        'Không thể gia hạn bản đặt này.',
      );
      r.expiresAt += extraMinutes * minute;
      r.extensionCount++;
      return r;
    });
  }
  changeResource(userId: string, reservationId: string, newResourceId: string): Reservation {
    this.expire(this.now());
    return this.repo.transact((s) => {
      customer(s, userId);
      const r = must(s.reservations, reservationId);
      ensure(r.userId === userId, 'Forbidden', 'Bản đặt không thuộc tài khoản này.', 403);
      ensure(
        r.status === ReservationStatus.HELD && r.expiresAt > this.now(),
        'InvalidReservationState',
        'Chỉ đổi tài nguyên của bản đặt đang giữ.',
      );
      activeHub(s, r.hubId);
      if (r.kind === ReservationKind.VEHICLE) {
        if (r.vehicleId === newResourceId) return r;
        const v = must(s.vehicles, newResourceId, 'Xe');
        ensure(
          v.currentHubId === r.hubId && freeVehicle(s, v),
          'ResourceConflict',
          'Xe mới không khả dụng trong cùng Hub.',
        );
        const old = r.vehicleId;
        r.status = ReservationStatus.CANCELLED;
        releaseReservation(s, r);
        r.vehicleId = v.id;
        r.status = ReservationStatus.HELD;
        v.status = VehicleStatus.RESERVED;
        ensure(old !== v.id, 'ResourceConflict', 'Trùng tài nguyên.');
      } else if (r.kind === ReservationKind.PARKING) {
        if (r.spaceId === newResourceId) return r;
        const p = must(s.spaces, newResourceId, 'Chỗ đỗ');
        ensure(
          p.hubId === r.hubId && p.status === SpaceStatus.FREE && !s.dispatchSpaceHolds.has(p.id),
          'ResourceConflict',
          'Chỗ mới không còn trống trong cùng Hub.',
        );
        r.status = ReservationStatus.CANCELLED;
        releaseReservation(s, r);
        r.spaceId = p.id;
        r.status = ReservationStatus.HELD;
        p.status = SpaceStatus.HELD;
      } else {
        if (r.portId === newResourceId) return r;
        const p = must(s.ports, newResourceId, 'Cổng sạc');
        const oldPower = r.portId ? must(s.ports, r.portId).powerKw : 0;
        ensure(
          p.hubId === r.hubId &&
            p.status === PortStatus.FREE &&
            !fault(s, 'CHARGING_PORT', p.id) &&
            powerUsed(s, r.hubId) - oldPower + p.powerKw <= must(s.hubs, r.hubId).chargingBudgetKw,
          'ResourceConflict',
          'Cổng mới không khả dụng hoặc vượt công suất Hub.',
        );
        r.status = ReservationStatus.CANCELLED;
        releaseReservation(s, r);
        r.portId = p.id;
        r.status = ReservationStatus.HELD;
        p.status = PortStatus.HELD;
      }
      return r;
    });
  }
  confirmParking(userId: string, reservationId: string): ParkingReservation {
    this.expire(this.now());
    return this.repo.transact((s) => {
      customer(s, userId);
      const r = must(s.reservations, reservationId);
      ensure(r.userId === userId, 'Forbidden', 'Bản đặt không thuộc tài khoản này.', 403);
      ensure(
        r.kind === ReservationKind.PARKING &&
          r.status === ReservationStatus.HELD &&
          r.expiresAt > this.now(),
        'ExpiredReservation',
        'Bản đặt không còn hiệu lực.',
      );
      activeHub(s, r.hubId);
      const p = must(s.spaces, r.spaceId);
      const v = must(s.vehicles, r.vehicleId);
      ensure(
        p.status === SpaceStatus.HELD &&
          !p.vehicleId &&
          !s.dispatchSpaceHolds.has(p.id) &&
          !v.parkingSpaceId &&
          v.ownerId === userId,
        'ResourceConflict',
        'Không thể xác nhận vị trí đỗ.',
      );
      p.status = SpaceStatus.OCCUPIED;
      p.vehicleId = v.id;
      v.currentHubId = r.hubId;
      v.parkingSpaceId = p.id;
      v.status = VehicleStatus.AVAILABLE;
      r.status = ReservationStatus.COMPLETED;
      return r;
    });
  }
  expire(now: number): number {
    return this.repo.transact((s) => {
      let count = 0;
      for (const r of s.reservations.values())
        if (held(r) && r.expiresAt <= now) {
          r.status = ReservationStatus.EXPIRED;
          releaseReservation(s, r);
          count++;
        }
      return count;
    });
  }
}
