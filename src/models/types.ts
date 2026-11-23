import type {
  User,
  Session,
  Hub,
  Vehicle,
  ParkingSpace,
  ChargingPort,
  VehicleReservation,
  ParkingReservation,
  ChargingReservation,
  Rental,
  ChargingSession,
  Incident,
  DispatchOrder,
} from './entities.js';
import type { Role, VehicleType, ScenarioType, IncidentStatus, DispatchStatus } from './enums.js';
export type ID = string;
export type Timestamp = number;
export type Money = number;
export interface Position {
  lat: number;
  lng: number;
  hubId?: ID;
}
export interface ResourceRef {
  kind: 'VEHICLE' | 'PARKING_SPACE' | 'CHARGING_PORT';
  id: ID;
}
export interface RegisterDTO {
  fullName: string;
  email?: string;
  phone?: string;
  password: string;
  confirmPassword: string;
}
export interface ProfileDTO {
  fullName?: string;
  email?: string;
  phone?: string;
}
export interface PublicUserDTO {
  id: ID;
  fullName: string;
  email?: string;
  phone?: string;
  role: Role;
}
export interface SessionDTO {
  token: string;
  expiresAt: Timestamp;
  user: PublicUserDTO;
}
export interface ResetChallenge {
  challengeId: ID;
  userId: ID;
  codeHash: string;
  expiresAt: Timestamp;
}
export interface ResetChallengeDTO {
  challengeId: ID;
  expiresAt: Timestamp;
  demoCode: string;
}
export interface PasswordResetDTO {
  challengeId: ID;
  code: string;
  newPassword: string;
  confirmPassword: string;
}
export interface ProviderIdentityDTO {
  provider: string;
  subject: string;
  email: string;
  fullName: string;
}
export interface HubSearchDTO {
  area?: string;
  routeHubIds?: ID[];
  vehicleType?: VehicleType;
  minBattery?: number;
  needsParking?: boolean;
  needsCharging?: boolean;
}
export interface HubSummaryDTO {
  id: ID;
  name: string;
  position: Position;
  openingHours: string;
  status: string;
  chargingBudgetKw: number;
  travelMinutesTo: Record<ID, number>;
  chargingTotalKw: number;
  chargingActiveKw: number;
  totalPorts: number;
  activePorts: number;
  heldPorts: number;
  connectedPorts: number;
  faultPorts: number;
  availableVehicles: number;
  freeSpaces: number;
  freePorts: number;
  totalSpaces: number;
  batteryAverage: number;
  chargingUsedKw: number;
  chargingAvailableKw: number;
}
export interface HubDetailDTO extends HubSummaryDTO {
  vehicles: (Vehicle & { rentable: boolean })[];
  spaces: ParkingSpace[];
  ports: ChargingPort[];
}
export interface NetworkSummaryDTO {
  hubs: HubSummaryDTO[];
  vehicles: number;
  availableVehicles: number;
  occupiedSpaces: number;
  totalSpaces: number;
  chargingSessions: number;
  openIncidents: number;
  pendingDispatches: number;
  waitingCharges: number;
}
export interface ParkingRequestDTO {
  vehicleId: ID;
  hubId: ID;
  spaceId: ID;
}
export interface ReturnDTO {
  hubId: ID;
  spaceId: ID;
}
export interface VehicleRequestDTO {
  vehicleId: ID;
  returnHubId: ID;
}
export interface ParkingVisit {
  id: ID;
  userId: ID;
  vehicleId: ID;
  hubId: ID;
  spaceId: ID;
  enteredAt: Timestamp;
  exitedAt?: Timestamp;
}
export interface Notification {
  id: ID;
  userId: ID;
  kind: string;
  title: string;
  message: string;
  createdAt: Timestamp;
  referenceId?: ID;
  readAt?: Timestamp;
}
export interface SimulationMetrics {
  requestedTrips: number;
  servedTrips: number;
  unservedTrips: number;
  blockedReturns: number;
  waitingCharges: number;
  completedCharges: number;
  expiredCharges: number;
  maxChargeWaitMinutes: number;
  lateCharges: number;
}
export interface SimulationAction {
  type: 'RELOCATE';
  fromHubId: ID;
  toHubId: ID;
  quantity: number;
  departMinute: number;
  arrivalMinute: number;
  reason: string;
}
export interface SimulationFrame {
  minute: number;
  availableVehicles: number;
  waitingCharges: number;
  unservedTrips: number;
  hubs: {
    hubId: ID;
    availableVehicles: number;
    occupiedSpaces: number;
    heldSpaces: number;
    capacity: number;
    freePorts: number;
    faultPorts: number;
    chargingKw: number;
  }[];
}
export interface SimulationComparison {
  baseline: SimulationMetrics;
  scenario: SimulationMetrics;
}
export interface SimulationProposal {
  action: SimulationAction;
  candidatesTested: number;
}
export interface SimulationTrial {
  scenarioId: ID;
  evaluatedAt: Timestamp;
  action: SimulationAction;
  before: SimulationMetrics;
  after: SimulationMetrics;
  timeline: SimulationFrame[];
}
export interface SimulationScope {
  scenarioType: ScenarioType;
  targetHubId: ID;
  targetHubName: string;
  horizonMinutes: number;
  normalOutboundRequests: number;
  scenarioOutboundRequests: number;
  initialAvailableVehicles: number;
  scenarioAvailableVehicles: number;
  initialUsablePorts: number;
  scenarioUsablePorts: number;
  totalPorts: number;
}
export interface ChargeRequestDTO {
  vehicleId: ID;
  hubId: ID;
  portId?: ID;
  targetBattery: number;
  requiredBy?: Timestamp;
}
export interface IncidentDTO {
  target: ResourceRef;
  description: string;
}
export interface IncidentFilterDTO {
  hubId?: ID;
  status?: IncidentStatus;
  technicianId?: ID;
}
export interface DispatchDTO {
  fromHubId: ID;
  toHubId: ID;
  quantity: number;
}
export interface DispatchFilterDTO {
  hubId?: ID;
  status?: DispatchStatus;
  technicianId?: ID;
  from?: Timestamp;
  to?: Timestamp;
}
export interface ScenarioDTO {
  type: ScenarioType;
  targetHubId: ID;
  parameters: Record<string, number>;
  horizonMinutes: number;
  seed: number;
}
export interface Telemetry {
  position: Position;
  batteryLevel: number;
  locked: boolean;
}
export interface DeviceResult {
  success: boolean;
  errorCode?: string;
  observedAt: Timestamp;
}
export type AnyReservation = VehicleReservation | ParkingReservation | ChargingReservation;
export interface NetworkState {
  users: Map<ID, User>;
  sessions: Map<ID, Session>;
  hubs: Map<ID, Hub>;
  vehicles: Map<ID, Vehicle>;
  spaces: Map<ID, ParkingSpace>;
  ports: Map<ID, ChargingPort>;
  reservations: Map<ID, AnyReservation>;
  rentals: Map<ID, Rental>;
  chargingSessions: Map<ID, ChargingSession>;
  incidents: Map<ID, Incident>;
  dispatchOrders: Map<ID, DispatchOrder>;
  dispatchSpaceHolds: Map<ID, ID>;
  returnSpaceHolds: Map<ID, ID>;
  parkingVisits: Map<ID, ParkingVisit>;
  notifications: Map<ID, Notification>;
}
export type Collection = Exclude<keyof NetworkState, 'dispatchSpaceHolds' | 'returnSpaceHolds'>;
export type StateAction<T> = (draft: NetworkState) => T;
