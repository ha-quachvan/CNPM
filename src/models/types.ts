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
export interface SimulationMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
  previous?: number;
}
export interface SimulationHubResource {
  hubId: ID;
  hubName: string;
  status: string;
  availableVehicles: number;
  donatableVehicles: number;
  freeSpaces: number;
  totalSpaces: number;
  usablePorts: number;
  freePorts: number;
  waitingCharges: number;
}
export interface SimulationAllocation {
  requestId: ID;
  vehicleId: ID;
  vehicleCode: string;
  portId: ID;
  simulated: boolean;
}
export interface SimulationWaiting {
  requestId: ID;
  vehicleId: ID;
  vehicleCode: string;
  reason: string;
  simulated: boolean;
}
export interface SimulationAffected {
  vehicleId: ID;
  vehicleCode: string;
  portId: ID;
  status: string;
  reason: string;
}
export interface SimulationAssessment {
  summary: string;
  metrics: SimulationMetric[];
  hubs: SimulationHubResource[];
  allocations: SimulationAllocation[];
  waiting: SimulationWaiting[];
  affected: SimulationAffected[];
  calculations: string[];
  notes: string[];
}
export type SimulationAction =
  | { type: 'RELOCATE'; fromHubId: ID; toHubId: ID; vehicleIds: ID[]; quantity: number }
  | { type: 'ALLOCATE'; hubId: ID; requestId: ID; vehicleId: ID; portId: ID }
  | { type: 'RECOVER_PORT'; hubId: ID; portId: ID }
  | { type: 'DISCONNECT'; hubId: ID; sessionId: ID; vehicleId: ID; portId: ID };
export interface SimulationProposal {
  id: string;
  title: string;
  description: string;
  actions: SimulationAction[];
  assumptions: string[];
}
export interface SimulationTrial {
  scenarioId: ID;
  proposalId: string;
  evaluatedAt: Timestamp;
  proposal: SimulationProposal;
  before: SimulationAssessment;
  after: SimulationAssessment;
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
  targetHubId?: ID;
  parameters: Record<string, number | string>;
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
