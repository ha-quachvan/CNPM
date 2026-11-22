import { Rental } from '../models/entities.js';
import {
  ReservationKind,
  ReservationStatus,
  VehicleStatus,
  SpaceStatus,
  RentalStatus,
  DeviceCommand,
} from '../models/enums.js';
import type { ReturnDTO } from '../models/types.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import { DeviceSimulator } from '../simulation/DeviceSimulator.js';
import { ensure, must } from '../shared/errors.js';
import { config, minute } from '../shared/config.js';
import { id } from '../shared/security.js';
import {
  customer,
  activeHub,
  fault,
  restoreVehicle,
  freeSpace,
  releaseReturnHold,
  notify,
} from '../shared/business.js';
export class RentalService {
  constructor(
    private repo: InMemoryRepository,
    private simulator: DeviceSimulator,
    private now = Date.now,
  ) {}
  pickup(userId: string, reservationId: string, code: string): Rental {
    return this.repo.transact((s) => {
      customer(s, userId);
      const r = must(s.reservations, reservationId);
      ensure(r.userId === userId, 'Forbidden', 'Bản đặt không thuộc tài khoản này.', 403);
      ensure(
        r.kind === ReservationKind.VEHICLE,
        'InvalidReservationState',
        'Bản đặt không phải đặt xe.',
      );
      ensure(
        r.status === ReservationStatus.HELD && r.expiresAt > this.now(),
        'ExpiredReservation',
        'Đã hết thời gian nhận xe.',
      );
      ensure(
        typeof code === 'string' && r.pickupCode === code,
        'InvalidPickupCode',
        'Mã nhận xe không đúng.',
        400,
      );
      activeHub(s, r.hubId);
      activeHub(s, r.plannedReturnHubId);
      ensure(
        s.returnSpaceHolds.get(r.plannedReturnSpaceId) === r.id,
        'ParkingConflict',
        'Chỗ trả xe chưa được giữ hợp lệ.',
      );
      const v = must(s.vehicles, r.vehicleId);
      ensure(
        v.status === VehicleStatus.RESERVED &&
          !fault(s, 'VEHICLE', v.id) &&
          ![...s.rentals.values()].some(
            (x) => x.vehicleId === v.id && x.status === RentalStatus.ACTIVE,
          ),
        'ResourceConflict',
        'Xe không sẵn sàng để nhận.',
      );
      ensure(
        this.simulator.execute({ kind: 'VEHICLE', id: v.id }, DeviceCommand.UNLOCK).success,
        'DeviceFailure',
        'Mở khóa giả lập thất bại. Dữ liệu được giữ nguyên.',
      );
      const p = must(s.spaces, v.parkingSpaceId!);
      ensure(
        p.vehicleId === v.id && p.status === SpaceStatus.OCCUPIED,
        'ResourceConflict',
        'Vị trí nguồn không khớp xe.',
      );
      p.vehicleId = undefined;
      p.status = SpaceStatus.FREE;
      const rental = new Rental({
        id: id('rental'),
        userId,
        vehicleId: v.id,
        reservationId: r.id,
        pickupHubId: r.hubId,
        plannedReturnHubId: r.plannedReturnHubId,
        plannedReturnSpaceId: r.plannedReturnSpaceId,
        startedAt: this.now(),
        fee: 0,
        penalty: 0,
        status: RentalStatus.ACTIVE,
      });
      s.rentals.set(rental.id, rental);
      r.status = ReservationStatus.CONFIRMED;
      v.currentHubId = undefined;
      v.parkingSpaceId = undefined;
      v.status = VehicleStatus.IN_USE;
      return rental;
    });
  }
  returnVehicle(userId: string, rentalId: string, data: ReturnDTO): Rental {
    return this.repo.transact((s) => {
      customer(s, userId);
      const r = must(s.rentals, rentalId, 'Phiên thuê');
      ensure(r.userId === userId, 'Forbidden', 'Phiên thuê không thuộc tài khoản này.', 403);
      if (r.status === RentalStatus.COMPLETED) return r;
      ensure(
        r.status === RentalStatus.ACTIVE,
        'InvalidRentalState',
        'Phiên thuê không còn hoạt động.',
      );
      const v = must(s.vehicles, r.vehicleId);
      ensure(v.status !== VehicleStatus.CHARGING, 'InvalidRentalState', 'Xe đang sạc.');
      const telemetry = this.simulator.readTelemetry(v.id);
      const fee =
        Math.max(1, Math.ceil((this.now() - r.startedAt) / minute)) * config.pricePerMinute;
      const penalty = data.hubId === r.plannedReturnHubId ? 0 : config.wrongHubPenalty;
      const p = s.spaces.get(data.spaceId);
      ensure(
        telemetry.position.hubId === data.hubId &&
          p &&
          p.hubId === data.hubId &&
          !p.vehicleId &&
          (freeSpace(s, p) ||
            (p.status === SpaceStatus.HELD && s.returnSpaceHolds.get(p.id) === r.reservationId)),
        'ParkingConflict',
        'Chưa xác nhận được chỗ trả xe. Phiên thuê tiếp tục; hãy chọn chỗ trống và xác nhận vị trí mô phỏng.',
        409,
        { returnConfirmed: false, fee, penalty },
      );
      activeHub(s, data.hubId);
      ensure(
        this.simulator.execute({ kind: 'VEHICLE', id: v.id }, DeviceCommand.LOCK).success,
        'DeviceFailure',
        'Khóa xe giả lập thất bại.',
      );
      r.endedAt = this.now();
      r.fee = fee;
      r.penalty = penalty;
      r.returnHubId = data.hubId;
      r.status = RentalStatus.COMPLETED;
      must(s.reservations, r.reservationId).status = ReservationStatus.COMPLETED;
      releaseReturnHold(s, r.reservationId);
      p.status = SpaceStatus.OCCUPIED;
      p.vehicleId = v.id;
      v.currentHubId = data.hubId;
      v.parkingSpaceId = p.id;
      v.batteryLevel = telemetry.batteryLevel;
      restoreVehicle(s, v);
      notify(
        s,
        userId,
        'RENTAL_RETURN',
        'Đã hoàn tất chuyến đi',
        `Xe ${v.code} đã được trả tại ${must(s.hubs, data.hubId).name}. Tổng phí ${fee + penalty} đồng.`,
        this.now(),
        r.id,
      );
      return r;
    });
  }
}
