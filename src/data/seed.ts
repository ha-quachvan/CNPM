import {
  User,
  Hub,
  Vehicle,
  ParkingSpace,
  ChargingPort,
  Incident,
  ChargingReservation,
  ChargingSession,
  Rental,
  VehicleReservation,
  DispatchOrder,
} from '../models/entities.js';
import {
  Role,
  HubStatus,
  VehicleType,
  VehicleOwnership,
  VehicleStatus,
  SpaceStatus,
  PortStatus,
  IncidentStatus,
  ReservationKind,
  ReservationStatus,
  ChargingSessionStatus,
  RentalStatus,
  DispatchStatus,
} from '../models/enums.js';
import type { NetworkState } from '../models/types.js';
import { hashPassword } from '../shared/security.js';
import { minute } from '../shared/config.js';
export const demoAccounts = [
  { id: 'customer', fullName: 'Nguyễn Minh Anh', email: 'customer@hub.local', role: Role.CUSTOMER },
  { id: 'customer2', fullName: 'Lê Quốc Bảo', email: 'customer2@hub.local', role: Role.CUSTOMER },
  {
    id: 'customer3',
    fullName: 'Trần Ngọc Linh',
    email: 'customer3@hub.local',
    role: Role.CUSTOMER,
  },
  { id: 'customer4', fullName: 'Phạm Gia Hân', email: 'customer4@hub.local', role: Role.CUSTOMER },
  { id: 'customer5', fullName: 'Võ Đức Minh', email: 'customer5@hub.local', role: Role.CUSTOMER },
  { id: 'customer6', fullName: 'Đặng Thảo Vy', email: 'customer6@hub.local', role: Role.CUSTOMER },
  { id: 'customer7', fullName: 'Bùi Anh Khoa', email: 'customer7@hub.local', role: Role.CUSTOMER },
  { id: 'customer8', fullName: 'Đỗ Phương Anh', email: 'customer8@hub.local', role: Role.CUSTOMER },
  { id: 'operator', fullName: 'Trần Thanh Hà', email: 'operator@hub.local', role: Role.OPERATOR },
  {
    id: 'technician',
    fullName: 'Phạm Hoàng Nam',
    email: 'technician@hub.local',
    role: Role.TECHNICIAN,
  },
  {
    id: 'technician2',
    fullName: 'Võ Gia Huy',
    email: 'technician2@hub.local',
    role: Role.TECHNICIAN,
  },
];
export const hubDefinitions = [
  {
    id: 'hub-metro',
    name: 'Ga Metro ĐHQG',
    capacity: 20,
    vehicles: 4,
    ports: 4,
    code: 4,
    lat: 10.879,
    lng: 106.803,
  },
  {
    id: 'hub-a',
    name: 'Ký túc xá Khu A',
    capacity: 20,
    vehicles: 14,
    ports: 4,
    code: 1,
    lat: 10.882,
    lng: 106.806,
  },
  {
    id: 'hub-b',
    name: 'Ký túc xá Khu B',
    capacity: 20,
    vehicles: 8,
    ports: 3,
    code: 2,
    lat: 10.886,
    lng: 106.799,
  },
  {
    id: 'hub-bk',
    name: 'Đại học Bách khoa',
    capacity: 16,
    vehicles: 9,
    ports: 3,
    code: 3,
    lat: 10.881,
    lng: 106.808,
  },
  {
    id: 'hub-library',
    name: 'Thư viện Trung tâm',
    capacity: 16,
    vehicles: 7,
    ports: 2,
    code: 5,
    lat: 10.884,
    lng: 106.804,
  },
  {
    id: 'hub-nvh',
    name: 'Nhà văn hóa Sinh viên',
    capacity: 8,
    vehicles: 0,
    ports: 2,
    code: 6,
    lat: 10.887,
    lng: 106.807,
  },
];
export function createSeed(now = Date.now()): NetworkState {
  const s: NetworkState = {
    users: new Map(),
    sessions: new Map(),
    hubs: new Map(),
    vehicles: new Map(),
    spaces: new Map(),
    ports: new Map(),
    reservations: new Map(),
    rentals: new Map(),
    chargingSessions: new Map(),
    incidents: new Map(),
    dispatchOrders: new Map(),
    dispatchSpaceHolds: new Map(),
    returnSpaceHolds: new Map(),
    parkingVisits: new Map(),
    notifications: new Map(),
  };
  const passwordHash = hashPassword('Demo@12345');
  for (const a of demoAccounts)
    s.users.set(a.id, new User({ ...a, passwordHash, failedLoginCount: 0, restricted: false }));
  const batteries = [55, 72, 44, 88, 16, 35, 65, 92, 24, 77, 12, 60, 81, 48];
  for (const h of hubDefinitions) {
    const active = h.id !== 'hub-nvh';
    s.hubs.set(
      h.id,
      new Hub({
        id: h.id,
        name: h.name,
        position: { lat: h.lat, lng: h.lng, hubId: h.id },
        openingHours: '06:00 – 22:00',
        status: active ? HubStatus.ACTIVE : HubStatus.MAINTENANCE,
        chargingBudgetKw: 0, // Derived below from the installed ports.
      }),
    );
    for (let i = 1; i <= h.capacity; i++) {
      const id = `${h.id}-p${i}`;
      s.spaces.set(
        id,
        new ParkingSpace({
          id,
          hubId: h.id,
          status: active ? SpaceStatus.FREE : SpaceStatus.MAINTENANCE,
        }),
      );
    }
    for (let i = 1; i <= h.ports; i++) {
      const id = `${h.id}-c${i}`;
      s.ports.set(
        id,
        new ChargingPort({
          id,
          hubId: h.id,
          powerKw: h.id === 'hub-a' && i === 1 ? 3.3 : i % 2 ? 2.2 : 3.3,
          status: active ? PortStatus.FREE : PortStatus.FAULT,
        }),
      );
    }
    s.hubs.get(h.id)!.chargingBudgetKw =
      Math.round(
        [...s.ports.values()]
          .filter((p) => p.hubId === h.id)
          .reduce((sum, p) => sum + p.powerKw, 0) * 100,
      ) / 100;
    for (let i = 1; i <= h.vehicles; i++) {
      const id = `${h.id}-v${i}`;
      const spaceId = `${h.id}-p${i}`;
      s.vehicles.set(
        id,
        new Vehicle({
          id,
          code: `${i % 2 ? 'EB' : 'EM'}-${h.code}${String(i).padStart(2, '0')}`,
          type: i % 2 ? VehicleType.E_BIKE : VehicleType.E_MOTORBIKE,
          ownership: VehicleOwnership.SHARED,
          currentHubId: h.id,
          parkingSpaceId: spaceId,
          batteryLevel: batteries[(i - 1) % batteries.length],
          capacityKWh: i % 2 ? 2 : 4,
          status: VehicleStatus.AVAILABLE,
        }),
      );
      Object.assign(s.spaces.get(spaceId)!, { status: SpaceStatus.OCCUPIED, vehicleId: id });
    }
  }
  const addPersonal = (
    id: string,
    ownerId: string,
    code: string,
    hubId: string | undefined,
    batteryLevel: number,
    motorbike = false,
  ) => {
    const p = hubId
      ? [...s.spaces.values()].find((p) => p.hubId === hubId && p.status === SpaceStatus.FREE)!
      : undefined;
    s.vehicles.set(
      id,
      new Vehicle({
        id,
        code,
        type: motorbike ? VehicleType.E_MOTORBIKE : VehicleType.E_BIKE,
        ownership: VehicleOwnership.PERSONAL,
        ownerId,
        currentHubId: hubId,
        parkingSpaceId: p?.id,
        batteryLevel,
        capacityKWh: motorbike ? 4 : 2,
        status: p ? VehicleStatus.AVAILABLE : VehicleStatus.IN_USE,
      }),
    );
    if (p) {
      Object.assign(p, { vehicleId: id, status: SpaceStatus.OCCUPIED });
      const visitId = `parking-seed-${id}`;
      s.parkingVisits.set(visitId, {
        id: visitId,
        userId: ownerId,
        vehicleId: id,
        hubId: hubId!,
        spaceId: p.id,
        enteredAt: now - 30 * minute,
      });
    }
  };
  addPersonal('personal-1', 'customer', '59-T1 123.45', 'hub-metro', 35);
  addPersonal('personal-2', 'customer', '59-T2 678.90', undefined, 58, true);
  addPersonal('personal-3', 'customer2', '59-T3 111.22', 'hub-b', 25);
  addPersonal('personal-4', 'customer6', '59-T4 246.80', 'hub-metro', 66);
  addPersonal('personal-5', 'customer3', '59-T5 135.79', 'hub-a', 50);
  addPersonal('personal-6', 'customer4', '59-T6 222.33', 'hub-a', 25);
  addPersonal('personal-7', 'customer5', '59-T7 444.55', 'hub-a', 15);
  addPersonal('personal-8', 'customer7', '59-T8 666.77', 'hub-b', 40, true);
  addPersonal('personal-9', 'customer8', '59-T9 888.99', 'hub-bk', 60);
  addPersonal('personal-10', 'customer', '59-U1 567.89', 'hub-library', 78);
  addPersonal('personal-11', 'customer2', '59-U2 345.67', 'hub-library', 45, true);
  addPersonal('personal-12', 'customer7', '59-U3 789.12', undefined, 52);
  // All three usable connectors at Hub A are busy; c4 is faulty.
  // Two genuine waiting requests demonstrate priority after a connector is unplugged.
  const active = new ChargingReservation({
    id: 'charge-seed-active',
    kind: ReservationKind.CHARGING,
    userId: 'customer3',
    hubId: 'hub-a',
    vehicleId: 'personal-5',
    portId: 'hub-a-c1',
    targetBattery: 95,
    createdAt: now - 2 * minute,
    expiresAt: now + 15 * minute,
    status: ReservationStatus.CONFIRMED,
    extensionCount: 0,
  });
  s.reservations.set(active.id, active);
  s.chargingSessions.set(
    'session-seed-active',
    new ChargingSession({
      id: 'session-seed-active',
      reservationId: active.id,
      vehicleId: active.vehicleId,
      portId: active.portId!,
      startedAt: now,
      updatedAt: now,
      targetBattery: 95,
      status: ChargingSessionStatus.ACTIVE,
    }),
  );
  s.vehicles.get(active.vehicleId)!.status = VehicleStatus.CHARGING;
  s.ports.get(active.portId!)!.status = PortStatus.CHARGING;
  for (const [i, vehicleId] of [
    [1, 'hub-a-v5'],
    [2, 'hub-a-v11'],
  ] as const) {
    const r = new ChargingReservation({
      id: `charge-seed-fleet-${i}`,
      kind: ReservationKind.CHARGING,
      userId: 'operator',
      hubId: 'hub-a',
      vehicleId,
      portId: `hub-a-c${i + 1}`,
      targetBattery: 85,
      createdAt: now - 3 * minute,
      expiresAt: now + 15 * minute,
      status: ReservationStatus.CONFIRMED,
      extensionCount: 0,
    });
    s.reservations.set(r.id, r);
    s.chargingSessions.set(
      `session-seed-fleet-${i}`,
      new ChargingSession({
        id: `session-seed-fleet-${i}`,
        reservationId: r.id,
        vehicleId,
        portId: r.portId!,
        startedAt: now,
        updatedAt: now,
        targetBattery: r.targetBattery,
        status: ChargingSessionStatus.ACTIVE,
      }),
    );
    s.vehicles.get(vehicleId)!.status = VehicleStatus.CHARGING;
    s.ports.get(r.portId!)!.status = PortStatus.CHARGING;
  }
  for (const [i, vehicleId, userId, requiredMinutes] of [
    [1, 'personal-6', 'customer4', 35],
    [2, 'personal-7', 'customer5', 20],
  ] as const) {
    const r = new ChargingReservation({
      id: `charge-seed-wait-${i}`,
      kind: ReservationKind.CHARGING,
      userId,
      hubId: 'hub-a',
      vehicleId,
      targetBattery: 80,
      requiredBy: now + requiredMinutes * minute,
      createdAt: now - (3 - i) * minute,
      expiresAt: now + 60 * minute,
      extensionCount: 0,
      status: ReservationStatus.WAITING,
      waitingReason: 'Ba cổng đang sạc, một cổng lỗi; chờ cổng trống phù hợp.',
    });
    s.reservations.set(r.id, r);
  }
  const incident = new Incident({
    id: 'incident-demo',
    reporterId: 'customer',
    target: { kind: 'VEHICLE', id: 'hub-bk-v4' },
    description: 'Khóa xe phản hồi chậm, cần kiểm tra trước khi đưa xe vào phục vụ.',
    status: IncidentStatus.OPEN,
    createdAt: now - 8 * minute,
  });
  s.incidents.set(incident.id, incident);
  s.vehicles.get('hub-bk-v4')!.status = VehicleStatus.MAINTENANCE;
  const portIncident = new Incident({
    id: 'incident-port-demo',
    reporterId: 'customer4',
    technicianId: 'technician2',
    target: { kind: 'CHARGING_PORT', id: 'hub-a-c4' },
    description: 'Đầu nối sạc không nhận tín hiệu.',
    status: IncidentStatus.ASSIGNED,
    createdAt: now - 20 * minute,
  });
  s.incidents.set(portIncident.id, portIncident);
  s.ports.get('hub-a-c4')!.status = PortStatus.FAULT;
  // History reuses existing vehicle IDs and never duplicates live inventory.
  for (let i = 1; i <= 5; i++) {
    const reservationId = `history-res-${i}`;
    const rentalId = `history-rental-${i}`;
    const createdAt = now - (i + 2) * 60 * minute;
    s.reservations.set(
      reservationId,
      new VehicleReservation({
        id: reservationId,
        kind: ReservationKind.VEHICLE,
        userId: 'customer',
        hubId: 'hub-a',
        vehicleId: 'hub-a-v1',
        createdAt,
        expiresAt: createdAt + 15 * minute,
        status: ReservationStatus.COMPLETED,
        extensionCount: 0,
        pickupCode: '000000',
        plannedReturnHubId: 'hub-b',
        plannedReturnSpaceId: 'hub-b-p1',
      }),
    );
    s.rentals.set(
      rentalId,
      new Rental({
        id: rentalId,
        userId: 'customer',
        vehicleId: 'hub-a-v1',
        reservationId,
        pickupHubId: 'hub-a',
        plannedReturnHubId: 'hub-b',
        plannedReturnSpaceId: 'hub-b-p1',
        returnHubId: 'hub-b',
        startedAt: createdAt + minute,
        endedAt: createdAt + 13 * minute,
        fee: 12000,
        penalty: 0,
        status: RentalStatus.COMPLETED,
      }),
    );
  }
  for (let i = 1; i <= 3; i++)
    s.dispatchOrders.set(
      `history-dispatch-${i}`,
      new DispatchOrder({
        id: `history-dispatch-${i}`,
        creatorId: 'operator',
        fromHubId: 'hub-a',
        toHubId: 'hub-metro',
        vehicleIds: ['hub-a-v2'],
        reservedSpaceIds: ['hub-metro-p1'],
        technicianId: 'technician',
        status: DispatchStatus.COMPLETED,
        createdAt: now - i * 120 * minute,
      }),
    );
  for (let i = 1; i <= 2; i++)
    s.parkingVisits.set(`history-parking-${i}`, {
      id: `history-parking-${i}`,
      userId: 'customer',
      vehicleId: 'personal-2',
      hubId: 'hub-b',
      spaceId: 'hub-b-p12',
      enteredAt: now - (i + 1) * 120 * minute,
      exitedAt: now - (i + 1) * 120 * minute + 30 * minute,
    });
  return s;
}
