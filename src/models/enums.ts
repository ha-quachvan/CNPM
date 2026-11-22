export enum Role {
  CUSTOMER = 'CUSTOMER',
  OPERATOR = 'OPERATOR',
  TECHNICIAN = 'TECHNICIAN',
}
export enum HubStatus {
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  CLOSED = 'CLOSED',
}
export enum VehicleType {
  E_BIKE = 'E_BIKE',
  E_MOTORBIKE = 'E_MOTORBIKE',
}
export enum VehicleOwnership {
  SHARED = 'SHARED',
  PERSONAL = 'PERSONAL',
}
export enum VehicleStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  IN_USE = 'IN_USE',
  CHARGING = 'CHARGING',
  DISPATCH_RESERVED = 'DISPATCH_RESERVED',
  IN_TRANSIT = 'IN_TRANSIT',
  MAINTENANCE = 'MAINTENANCE',
}
export enum SpaceStatus {
  FREE = 'FREE',
  HELD = 'HELD',
  OCCUPIED = 'OCCUPIED',
  MAINTENANCE = 'MAINTENANCE',
}
export enum PortStatus {
  FREE = 'FREE',
  HELD = 'HELD',
  CHARGING = 'CHARGING',
  CONNECTED = 'CONNECTED',
  FAULT = 'FAULT',
}
export enum ReservationKind {
  VEHICLE = 'VEHICLE',
  PARKING = 'PARKING',
  CHARGING = 'CHARGING',
}
export enum ReservationStatus {
  WAITING = 'WAITING',
  HELD = 'HELD',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}
export enum RentalStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}
export enum ChargingSessionStatus {
  ACTIVE = 'ACTIVE',
  AWAITING_DISCONNECT = 'AWAITING_DISCONNECT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
export enum IncidentStatus {
  OPEN = 'OPEN',
  ASSIGNED = 'ASSIGNED',
  RESOLVED = 'RESOLVED',
}
export enum DispatchStatus {
  PENDING = 'PENDING',
  IN_TRANSIT = 'IN_TRANSIT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
export enum ScenarioType {
  DEMAND_SURGE = 'DEMAND_SURGE',
  HUB_FULL = 'HUB_FULL',
  CHARGING_SURGE = 'CHARGING_SURGE',
  PORT_FAILURE = 'PORT_FAILURE',
  VEHICLE_IMBALANCE = 'VEHICLE_IMBALANCE',
}
export enum DeviceCommand {
  LOCK = 'LOCK',
  UNLOCK = 'UNLOCK',
  CHECK = 'CHECK',
}
