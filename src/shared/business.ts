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
import type { Vehicle, User } from '../models/entities.js';
import { ensure, must } from './errors.js';
import { config } from './config.js';
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
    !fault(s, 'VEHICLE', v.id)
  );
}
export function canCharge(s: NetworkState, userId: ID, v: Vehicle): void {
  ensure(
    v.ownership === VehicleOwnership.PERSONAL
      ? v.ownerId === userId
      : [...s.rentals.values()].some(
          (r) => r.userId === userId && r.vehicleId === v.id && r.status === RentalStatus.ACTIVE,
        ),
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
      ].includes(v.status),
    'ResourceConflict',
    'Xe không sẵn sàng để sạc.',
  );
}
export function restoreVehicle(s: NetworkState, v: Vehicle): void {
  if (
    [...s.chargingSessions.values()].some(
      (c) => c.vehicleId === v.id && c.status === ChargingSessionStatus.ACTIVE,
    )
  )
    v.status = VehicleStatus.CHARGING;
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
  if (r.kind === ReservationKind.VEHICLE) restoreVehicle(s, must(s.vehicles, r.vehicleId));
  if ('spaceId' in r) {
    const p = must(s.spaces, r.spaceId);
    if (
      p.status === SpaceStatus.HELD &&
      !p.vehicleId &&
      !s.dispatchSpaceHolds.has(p.id) &&
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
export function resourceHub(s: NetworkState, target: ResourceRef): ID | undefined {
  return target.kind === 'VEHICLE'
    ? s.vehicles.get(target.id)?.currentHubId
    : s.ports.get(target.id)?.hubId;
}
