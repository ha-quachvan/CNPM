import {
  Role,
  HubStatus,
  VehicleType,
  VehicleOwnership,
  VehicleStatus,
  SpaceStatus,
  PortStatus,
  ReservationKind,
  ReservationStatus,
  RentalStatus,
  ChargingSessionStatus,
  IncidentStatus,
  DispatchStatus,
  ScenarioType,
} from './enums.js';
import type { ID, Timestamp, Money, Position, ResourceRef, NetworkState } from './types.js';

export class User {
  id!: ID;
  fullName!: string;
  email?: string;
  phone?: string;
  passwordHash!: string;
  role!: Role;
  failedLoginCount!: number;
  failedWindowStart?: Timestamp;
  lockedUntil?: Timestamp;
  restricted!: boolean;
  constructor(data: Partial<User> = {}) {
    Object.assign(this, data);
  }
}

export class Session {
  id!: ID;
  userId!: ID;
  expiresAt!: Timestamp;
  constructor(data: Partial<Session> = {}) {
    Object.assign(this, data);
  }
}

export class Hub {
  id!: ID;
  name!: string;
  position!: Position;
  openingHours!: string;
  status!: HubStatus;
  chargingBudgetKw!: number;
  constructor(data: Partial<Hub> = {}) {
    Object.assign(this, data);
  }
}

export class Vehicle {
  id!: ID;
  code!: string;
  type!: VehicleType;
  ownership!: VehicleOwnership;
  ownerId?: ID;
  currentHubId?: ID;
  parkingSpaceId?: ID;
  batteryLevel!: number;
  capacityKWh!: number;
  status!: VehicleStatus;
  constructor(data: Partial<Vehicle> = {}) {
    Object.assign(this, data);
  }
}

export class ParkingSpace {
  id!: ID;
  hubId!: ID;
  status!: SpaceStatus;
  vehicleId?: ID;
  constructor(data: Partial<ParkingSpace> = {}) {
    Object.assign(this, data);
  }
}

export class ChargingPort {
  id!: ID;
  hubId!: ID;
  powerKw!: number;
  status!: PortStatus;
  constructor(data: Partial<ChargingPort> = {}) {
    Object.assign(this, data);
  }
}

export abstract class Reservation {
  id!: ID;
  kind!: ReservationKind;
  userId!: ID;
  hubId!: ID;
  createdAt!: Timestamp;
  expiresAt!: Timestamp;
  status!: ReservationStatus;
  extensionCount!: number;
  constructor(data: Partial<Reservation> = {}) {
    Object.assign(this, data);
  }
}

export class VehicleReservation extends Reservation {
  declare kind: ReservationKind.VEHICLE;
  vehicleId!: ID;
  pickupCode!: string;
  constructor(data: Partial<VehicleReservation> = {}) {
    super(data);
    Object.assign(this, data);
  }
}

export class ParkingReservation extends Reservation {
  declare kind: ReservationKind.PARKING;
  vehicleId!: ID;
  spaceId!: ID;
  constructor(data: Partial<ParkingReservation> = {}) {
    super(data);
    Object.assign(this, data);
  }
}

export class ChargingReservation extends Reservation {
  declare kind: ReservationKind.CHARGING;
  vehicleId!: ID;
  portId?: ID;
  targetBattery!: number;
  requiredBy?: Timestamp;
  constructor(data: Partial<ChargingReservation> = {}) {
    super(data);
    Object.assign(this, data);
  }
}

export class Rental {
  id!: ID;
  userId!: ID;
  vehicleId!: ID;
  reservationId!: ID;
  pickupHubId!: ID;
  returnHubId?: ID;
  startedAt!: Timestamp;
  endedAt?: Timestamp;
  fee!: Money;
  penalty!: Money;
  status!: RentalStatus;
  constructor(data: Partial<Rental> = {}) {
    Object.assign(this, data);
  }
}

export class ChargingSession {
  id!: ID;
  reservationId!: ID;
  vehicleId!: ID;
  portId!: ID;
  startedAt!: Timestamp;
  updatedAt!: Timestamp;
  endedAt?: Timestamp;
  targetBattery!: number;
  status!: ChargingSessionStatus;
  constructor(data: Partial<ChargingSession> = {}) {
    Object.assign(this, data);
  }
}

export class Incident {
  id!: ID;
  reporterId!: ID;
  target!: ResourceRef;
  description!: string;
  technicianId?: ID;
  status!: IncidentStatus;
  createdAt!: Timestamp;
  resolutionNotes?: string;
  constructor(data: Partial<Incident> = {}) {
    Object.assign(this, data);
  }
}

export class DispatchOrder {
  id!: ID;
  creatorId!: ID;
  fromHubId!: ID;
  toHubId!: ID;
  vehicleIds!: ID[];
  reservedSpaceIds!: ID[];
  technicianId?: ID;
  status!: DispatchStatus;
  createdAt!: Timestamp;
  constructor(data: Partial<DispatchOrder> = {}) {
    Object.assign(this, data);
  }
}

export class Scenario {
  id!: ID;
  creatorId!: ID;
  type!: ScenarioType;
  targetHubId!: ID;
  parameters!: Map<string, number>;
  horizonMinutes!: number;
  seed!: number;
  constructor(data: Partial<Scenario> = {}) {
    Object.assign(this, data);
  }
}

export class SimulationResult {
  scenarioId!: ID;
  generatedAt!: Timestamp;
  metrics!: Map<string, number>;
  recommendations!: string[];
  constructor(data: Partial<SimulationResult> = {}) {
    Object.assign(this, data);
  }
}

export class NetworkSnapshot {
  capturedAt!: Timestamp;
  state!: NetworkState;
  constructor(data: Partial<NetworkSnapshot> = {}) {
    Object.assign(this, data);
  }
}
