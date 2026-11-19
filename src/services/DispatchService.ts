import { DispatchOrder } from '../models/entities.js';
import { Role, DispatchStatus, VehicleStatus, SpaceStatus } from '../models/enums.js';
import type { DispatchDTO, DispatchFilterDTO, NetworkState } from '../models/types.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import { DeviceSimulator } from '../simulation/DeviceSimulator.js';
import { actor, activeHub, freeVehicle, restoreVehicle, fault } from '../shared/business.js';
import { ensure, must, numeric } from '../shared/errors.js';
import { id } from '../shared/security.js';
export class DispatchService {
  constructor(
    private repo: InMemoryRepository,
    private simulator: DeviceSimulator,
    private now = Date.now,
  ) {}
  create(operatorId: string, data: DispatchDTO): DispatchOrder {
    return this.repo.transact((s) => {
      actor(s, operatorId, [Role.OPERATOR]);
      const order = new DispatchOrder({
        id: id('dispatch'),
        creatorId: operatorId,
        fromHubId: data.fromHubId,
        toHubId: data.toHubId,
        vehicleIds: [],
        reservedSpaceIds: [],
        status: DispatchStatus.PENDING,
        createdAt: this.now(),
      });
      this.allocate(s, order, data);
      s.dispatchOrders.set(order.id, order);
      return order;
    });
  }
  list(actorId: string, filter: DispatchFilterDTO): DispatchOrder[] {
    const s = this.repo.snapshot().state;
    const u = actor(s, actorId, [Role.OPERATOR, Role.TECHNICIAN]);
    return [...s.dispatchOrders.values()]
      .filter(
        (o) =>
          u.role === Role.OPERATOR ||
          o.status === DispatchStatus.PENDING ||
          o.technicianId === u.id,
      )
      .filter(
        (o) =>
          (!filter.hubId || o.fromHubId === filter.hubId || o.toHubId === filter.hubId) &&
          (!filter.status || o.status === filter.status) &&
          (!filter.technicianId || o.technicianId === filter.technicianId) &&
          (filter.from === undefined || o.createdAt >= filter.from) &&
          (filter.to === undefined || o.createdAt <= filter.to),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  getDetail(actorId: string, orderId: string): DispatchOrder {
    const s = this.repo.snapshot().state;
    const u = actor(s, actorId, [Role.OPERATOR, Role.TECHNICIAN]);
    const o = must(s.dispatchOrders, orderId, 'Lệnh');
    ensure(
      u.role === Role.OPERATOR || o.status === DispatchStatus.PENDING || o.technicianId === u.id,
      'Forbidden',
      'Bạn không được xem lệnh này.',
      403,
    );
    return o;
  }
  update(operatorId: string, orderId: string, data: DispatchDTO): DispatchOrder {
    return this.repo.transact((s) => {
      actor(s, operatorId, [Role.OPERATOR]);
      const o = must(s.dispatchOrders, orderId, 'Lệnh');
      ensure(
        o.status === DispatchStatus.PENDING,
        'InvalidOrderState',
        'Chỉ sửa lệnh đang chờ nhận.',
      );
      this.release(s, o);
      this.allocate(s, o, data);
      o.fromHubId = data.fromHubId;
      o.toHubId = data.toHubId;
      o.status = DispatchStatus.PENDING;
      return o;
    });
  }
  cancel(operatorId: string, orderId: string): void {
    this.repo.transact((s) => {
      actor(s, operatorId, [Role.OPERATOR]);
      const o = must(s.dispatchOrders, orderId, 'Lệnh');
      ensure(
        o.status === DispatchStatus.PENDING,
        'InvalidOrderState',
        'Chỉ hủy lệnh đang chờ nhận.',
      );
      this.release(s, o);
    });
  }
  accept(technicianId: string, orderId: string): DispatchOrder {
    return this.repo.transact((s) => {
      actor(s, technicianId, [Role.TECHNICIAN]);
      const o = must(s.dispatchOrders, orderId, 'Lệnh');
      ensure(
        o.status === DispatchStatus.PENDING && !o.technicianId,
        'AssignmentConflict',
        'Lệnh đã có người nhận hoặc không còn chờ.',
      );
      activeHub(s, o.fromHubId);
      activeHub(s, o.toHubId);
      for (const vid of o.vehicleIds) {
        const v = must(s.vehicles, vid);
        ensure(
          v.status === VehicleStatus.DISPATCH_RESERVED &&
            v.currentHubId === o.fromHubId &&
            !fault(s, 'VEHICLE', v.id),
          'ResourceConflict',
          'Xe trong lệnh không sẵn sàng.',
        );
        const p = must(s.spaces, v.parkingSpaceId!);
        ensure(
          p.vehicleId === vid && p.status === SpaceStatus.OCCUPIED,
          'ResourceConflict',
          'Vị trí nguồn không khớp.',
        );
        p.vehicleId = undefined;
        p.status = SpaceStatus.FREE;
        v.currentHubId = undefined;
        v.parkingSpaceId = undefined;
        v.status = VehicleStatus.IN_TRANSIT;
      }
      o.status = DispatchStatus.IN_TRANSIT;
      o.technicianId = technicianId;
      return o;
    });
  }
  complete(technicianId: string, orderId: string): DispatchOrder {
    return this.repo.transact((s) => {
      actor(s, technicianId, [Role.TECHNICIAN]);
      const o = must(s.dispatchOrders, orderId, 'Lệnh');
      ensure(
        o.technicianId === technicianId,
        'Forbidden',
        'Chỉ kỹ thuật viên đã nhận được hoàn tất lệnh.',
        403,
      );
      if (o.status === DispatchStatus.COMPLETED) return o;
      ensure(
        o.status === DispatchStatus.IN_TRANSIT,
        'InvalidOrderState',
        'Lệnh chưa bắt đầu vận chuyển.',
      );
      activeHub(s, o.toHubId);
      o.vehicleIds.forEach((vid, index) => {
        const v = must(s.vehicles, vid);
        const p = must(s.spaces, o.reservedSpaceIds[index]);
        ensure(
          this.simulator.readTelemetry(vid).position.hubId === o.toHubId,
          'LocationMismatch',
          'Vị trí mô phỏng chưa ở Hub đích.',
        );
        ensure(
          v.status === VehicleStatus.IN_TRANSIT &&
            !fault(s, 'VEHICLE', vid) &&
            s.dispatchSpaceHolds.get(p.id) === o.id &&
            p.status === SpaceStatus.HELD &&
            !p.vehicleId,
          'CapacityConflict',
          'Xe hoặc chỗ nhận không còn hợp lệ.',
        );
      });
      o.status = DispatchStatus.COMPLETED;
      o.vehicleIds.forEach((vid, index) => {
        const v = must(s.vehicles, vid);
        const p = must(s.spaces, o.reservedSpaceIds[index]);
        p.vehicleId = vid;
        p.status = SpaceStatus.OCCUPIED;
        s.dispatchSpaceHolds.delete(p.id);
        v.currentHubId = o.toHubId;
        v.parkingSpaceId = p.id;
        restoreVehicle(s, v);
      });
      return o;
    });
  }
  private allocate(s: NetworkState, o: DispatchOrder, data: DispatchDTO): void {
    numeric(data.quantity, 'Số xe', 1, 50);
    ensure(Number.isInteger(data.quantity), 'InvalidQuantity', 'Số xe phải là số nguyên.', 400);
    activeHub(s, data.fromHubId);
    activeHub(s, data.toHubId);
    ensure(data.fromHubId !== data.toHubId, 'InvalidHub', 'Hub nguồn và đích phải khác nhau.', 400);
    const vehicles = [...s.vehicles.values()]
      .filter((v) => v.currentHubId === data.fromHubId && freeVehicle(s, v))
      .slice(0, data.quantity);
    const spaces = [...s.spaces.values()]
      .filter(
        (p) =>
          p.hubId === data.toHubId &&
          p.status === SpaceStatus.FREE &&
          !s.dispatchSpaceHolds.has(p.id),
      )
      .slice(0, data.quantity);
    ensure(
      vehicles.length === data.quantity,
      'InsufficientVehicles',
      'Hub nguồn không đủ xe khả dụng.',
    );
    ensure(
      spaces.length === data.quantity,
      'InsufficientCapacity',
      'Hub đích không đủ chỗ tiếp nhận.',
    );
    o.vehicleIds = vehicles.map((v) => v.id);
    o.reservedSpaceIds = spaces.map((p) => p.id);
    vehicles.forEach((v) => (v.status = VehicleStatus.DISPATCH_RESERVED));
    spaces.forEach((p) => {
      p.status = SpaceStatus.HELD;
      s.dispatchSpaceHolds.set(p.id, o.id);
    });
  }
  private release(s: NetworkState, o: DispatchOrder): void {
    o.status = DispatchStatus.CANCELLED;
    for (const vid of o.vehicleIds) restoreVehicle(s, must(s.vehicles, vid));
    for (const pid of o.reservedSpaceIds)
      if (s.dispatchSpaceHolds.get(pid) === o.id) {
        s.dispatchSpaceHolds.delete(pid);
        const p = must(s.spaces, pid);
        if (p.status === SpaceStatus.HELD && !p.vehicleId) p.status = SpaceStatus.FREE;
      }
  }
}
