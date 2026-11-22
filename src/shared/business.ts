import {
  Role,
  HubStatus,
  VehicleOwnership,
  VehicleStatus,
  SpaceStatus,
  PortStatus,
  ReservationStatus,
  ReservationKind,
  RentalStatus,
  ChargingSessionStatus,
  IncidentStatus,
  DispatchStatus,
} from '../models/enums.js';
import type { NetworkState, AnyReservation, ResourceRef, ID } from '../models/types.js';
import type { Vehicle, User, ParkingSpace } from '../models/entities.js';
import { ensure, must } from './errors.js';
import { config } from './config.js';
import { id } from './security.js';
export const held = (r: AnyReservation) =>
  r.status === ReservationStatus.HELD || r.status === ReservationStatus.WAITING;
export function actor(s: NetworkState, userId: ID, roles?: Role[]): User {
  const user = must(s.users, userId, 'Tài khoản');
  ensure(
    !roles || roles.includes(user.role),
    'Forbidden',
    'Bạn không có quyền thực hiện thao tác này.',
    403,
  );
  return user;
}
export function customer(s: NetworkState, userId: ID): User {
  const u = actor(s, userId, [Role.CUSTOMER]);
  ensure(!u.restricted, 'NotEligible', 'Tài khoản đang bị hạn chế sử dụng.');
  return u;
}
export function activeHub(s: NetworkState, hubId: ID) {
  const hub = must(s.hubs, hubId, 'Hub');
  ensure(hub.status === HubStatus.ACTIVE, 'HubUnavailable', 'Hub đang đóng hoặc bảo trì.');
  return hub;
}
export function fault(s: NetworkState, kind: ResourceRef['kind'], id: ID): boolean {
  return [...s.incidents.values()].some(
    (i) => i.target.kind === kind && i.target.id === id && i.status !== IncidentStatus.RESOLVED,
  );
}
export function freeVehicle(s: NetworkState, v: Vehicle): boolean {
  return (
    v.ownership === VehicleOwnership.SHARED &&
    v.status === VehicleStatus.AVAILABLE &&
    v.batteryLevel >= config.minBattery &&
    !!v.currentHubId &&
    !!v.parkingSpaceId &&
    ![...s.reservations.values()].some(
      (r) => r.kind === ReservationKind.CHARGING && r.vehicleId === v.id && held(r),
    ) &&
    !connected(s, v.id) &&
    !fault(s, 'VEHICLE', v.id)
  );
}
export function canCharge(s: NetworkState, userId: ID, v: Vehicle): void {
  const u = actor(s, userId, [Role.CUSTOMER, Role.OPERATOR]);
  if (u.role === Role.CUSTOMER) customer(s, userId);
  ensure(
    v.ownership === VehicleOwnership.PERSONAL
      ? u.role === Role.CUSTOMER && v.ownerId === userId
      : u.role === Role.OPERATOR,
    'Forbidden',
    'Bạn không có quyền sử dụng xe này.',
    403,
  );
  ensure(
    !fault(s, 'VEHICLE', v.id) &&
      ![
        VehicleStatus.MAINTENANCE,
        VehicleStatus.IN_TRANSIT,
        VehicleStatus.DISPATCH_RESERVED,
        VehicleStatus.RESERVED,
      ].includes(v.status),
    'ResourceConflict',
    'Xe không sẵn sàng để sạc.',
  );
}
export function restoreVehicle(s: NetworkState, v: Vehicle): void {
  if (connected(s, v.id)) v.status = VehicleStatus.CHARGING;
  else if (
    [...s.rentals.values()].some((r) => r.vehicleId === v.id && r.status === RentalStatus.ACTIVE)
  )
    v.status = VehicleStatus.IN_USE;
  else if (
    [...s.dispatchOrders.values()].some(
      (o) => o.vehicleIds.includes(v.id) && o.status === DispatchStatus.IN_TRANSIT,
    )
  )
    v.status = VehicleStatus.IN_TRANSIT;
  else if (
    [...s.dispatchOrders.values()].some(
      (o) => o.vehicleIds.includes(v.id) && o.status === DispatchStatus.PENDING,
    )
  )
    v.status = VehicleStatus.DISPATCH_RESERVED;
  else if (
    [...s.reservations.values()].some(
      (r) =>
        r.kind === ReservationKind.VEHICLE &&
        r.vehicleId === v.id &&
        r.status === ReservationStatus.HELD,
    )
  )
    v.status = VehicleStatus.RESERVED;
  else if (fault(s, 'VEHICLE', v.id)) v.status = VehicleStatus.MAINTENANCE;
  else
    v.status = v.currentHubId && v.parkingSpaceId ? VehicleStatus.AVAILABLE : VehicleStatus.IN_USE;
}
export function restorePort(s: NetworkState, portId: ID): void {
  const p = must(s.ports, portId, 'Cổng sạc');
  if (fault(s, 'CHARGING_PORT', p.id)) p.status = PortStatus.FAULT;
  else if (
    [...s.chargingSessions.values()].some(
      (c) => c.portId === p.id && c.status === ChargingSessionStatus.AWAITING_DISCONNECT,
    )
  )
    p.status = PortStatus.CONNECTED;
  else if (
    [...s.chargingSessions.values()].some(
      (c) => c.portId === p.id && c.status === ChargingSessionStatus.ACTIVE,
    )
  )
    p.status = PortStatus.CHARGING;
  else if (
    [...s.reservations.values()].some(
      (r) =>
        r.kind === ReservationKind.CHARGING &&
        r.portId === p.id &&
        r.status === ReservationStatus.HELD,
    )
  )
    p.status = PortStatus.HELD;
  else p.status = PortStatus.FREE;
}
export function releaseReservation(s: NetworkState, r: AnyReservation): void {
  if (r.kind === ReservationKind.VEHICLE) {
    restoreVehicle(s, must(s.vehicles, r.vehicleId));
    releaseReturnHold(s, r.id);
  }
  if ('spaceId' in r) {
    const p = must(s.spaces, r.spaceId);
    if (
      p.status === SpaceStatus.HELD &&
      !p.vehicleId &&
      !s.dispatchSpaceHolds.has(p.id) &&
      !s.returnSpaceHolds.has(p.id) &&
      ![...s.reservations.values()].some(
        (other) =>
          other.id !== r.id &&
          'spaceId' in other &&
          other.spaceId === p.id &&
          other.status === ReservationStatus.HELD,
      )
    )
      p.status = SpaceStatus.FREE;
  }
  if ('portId' in r && r.portId) restorePort(s, r.portId);
}
export function powerUsed(s: NetworkState, hubId: ID): number {
  return [...s.ports.values()]
    .filter(
      (p) =>
        p.hubId === hubId &&
        (p.status === PortStatus.HELD ||
          [...s.reservations.values()].some(
            (r) =>
              r.kind === ReservationKind.CHARGING &&
              r.portId === p.id &&
              r.status === ReservationStatus.HELD,
          ) ||
          [...s.chargingSessions.values()].some(
            (c) => c.portId === p.id && c.status === ChargingSessionStatus.ACTIVE,
          )),
    )
    .reduce((n, p) => n + p.powerKw, 0);
}
/** Installed nameplate power; there is no separate, configurable Hub power cap. */
export function totalChargingPower(s: NetworkState, hubId: ID): number {
  return (
    Math.round(
      [...s.ports.values()]
        .filter((p) => p.hubId === hubId)
        .reduce((total, p) => total + p.powerKw, 0) * 100,
    ) / 100
  );
}
export function resourceHub(s: NetworkState, target: ResourceRef): ID | undefined {
  return target.kind === 'VEHICLE'
    ? s.vehicles.get(target.id)?.currentHubId
    : s.ports.get(target.id)?.hubId;
}

export function connected(s: NetworkState, vehicleId: ID): boolean {
  return [...s.chargingSessions.values()].some(
    (c) =>
      c.vehicleId === vehicleId &&
      [ChargingSessionStatus.ACTIVE, ChargingSessionStatus.AWAITING_DISCONNECT].includes(c.status),
  );
}
export function freeSpace(s: NetworkState, p: ParkingSpace): boolean {
  return (
    p.status === SpaceStatus.FREE &&
    !p.vehicleId &&
    !s.dispatchSpaceHolds.has(p.id) &&
    !s.returnSpaceHolds.has(p.id)
  );
}
export function releaseReturnHold(s: NetworkState, reservationId: ID): void {
  for (const [spaceId, owner] of s.returnSpaceHolds)
    if (owner === reservationId) {
      s.returnSpaceHolds.delete(spaceId);
      const p = must(s.spaces, spaceId);
      if (p.status === SpaceStatus.HELD && !p.vehicleId) p.status = SpaceStatus.FREE;
    }
}
export function holdReturnSpace(s: NetworkState, reservationId: ID, hubId: ID): ParkingSpace {
  activeHub(s, hubId);
  const p = [...s.spaces.values()].find((p) => p.hubId === hubId && freeSpace(s, p));
  ensure(p, 'InsufficientCapacity', 'Hub trả không còn chỗ tiếp nhận. Hãy chọn Hub khác.');
  p.status = SpaceStatus.HELD;
  s.returnSpaceHolds.set(p.id, reservationId);
  return p;
}
export function notify(
  s: NetworkState,
  userId: ID,
  kind: string,
  title: string,
  message: string,
  now: number,
  referenceId?: ID,
): void {
  if (
    referenceId &&
    [...s.notifications.values()].some(
      (n) => n.userId === userId && n.kind === kind && n.referenceId === referenceId,
    )
  )
    return;
  const notificationId = id('notification');
  s.notifications.set(notificationId, {
    id: notificationId,
    userId,
    kind,
    title,
    message,
    createdAt: now,
    referenceId,
  });
}
