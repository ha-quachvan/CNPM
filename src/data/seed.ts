import { User, Hub, Vehicle, ParkingSpace, ChargingPort, Incident } from '../models/entities.js';
import {
  Role,
  HubStatus,
  VehicleType,
  VehicleOwnership,
  VehicleStatus,
  SpaceStatus,
  PortStatus,
  IncidentStatus,
} from '../models/enums.js';
import type { NetworkState } from '../models/types.js';
import { hashPassword } from '../shared/security.js';
export const demoAccounts = [
  { id: 'customer', fullName: 'Nguyễn Minh Anh', email: 'customer@hub.local', role: Role.CUSTOMER },
  { id: 'customer2', fullName: 'Lê Quốc Bảo', email: 'customer2@hub.local', role: Role.CUSTOMER },
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
  };
  const passwordHash = hashPassword('Demo@12345');
  for (const a of demoAccounts)
    s.users.set(a.id, new User({ ...a, passwordHash, failedLoginCount: 0, restricted: false }));
  const names = [
    'Ký túc xá Khu A',
    'Ký túc xá Khu B',
    'Đại học Bách khoa',
    'Nhà văn hóa Sinh viên',
  ];
  for (let i = 0; i < names.length; i++) {
    const hubId = ['hub-a', 'hub-b', 'hub-bk', 'hub-nvh'][i];
    s.hubs.set(
      hubId,
      new Hub({
        id: hubId,
        name: names[i],
        position: { lat: 10.879 + i * 0.003, lng: 106.8 + i * 0.004, hubId },
        openingHours: '06:00 – 22:00',
        status: i === 3 ? HubStatus.MAINTENANCE : HubStatus.ACTIVE,
        chargingBudgetKw: 5.5,
      }),
    );
    for (let p = 1; p <= 10; p++) {
      const pid = `${hubId}-p${p}`;
      s.spaces.set(pid, new ParkingSpace({ id: pid, hubId, status: SpaceStatus.FREE }));
    }
    for (let p = 1; p <= 2; p++) {
      const pid = `${hubId}-c${p}`;
      s.ports.set(
        pid,
        new ChargingPort({
          id: pid,
          hubId,
          powerKw: p === 1 ? 2.2 : 3.3,
          status: i === 3 ? PortStatus.FAULT : PortStatus.FREE,
        }),
      );
    }
    if (i === 3) continue;
    for (let v = 1; v <= [5, 3, 4][i]; v++) {
      const vid = `${hubId}-v${v}`;
      const pid = `${hubId}-p${v}`;
      s.vehicles.set(
        vid,
        new Vehicle({
          id: vid,
          code: `${v % 2 ? 'EB' : 'EM'}-${i + 1}0${v}`,
          type: v % 2 ? VehicleType.E_BIKE : VehicleType.E_MOTORBIKE,
          ownership: VehicleOwnership.SHARED,
          currentHubId: hubId,
          parkingSpaceId: pid,
          batteryLevel: 40 + ((v * 11 + i * 7) % 60),
          capacityKWh: v % 2 ? 2 : 4,
          status: VehicleStatus.AVAILABLE,
        }),
      );
      Object.assign(s.spaces.get(pid)!, { vehicleId: vid, status: SpaceStatus.OCCUPIED });
    }
  }
  const personal = new Vehicle({
    id: 'personal-1',
    code: '59-T1 123.45',
    type: VehicleType.E_BIKE,
    ownership: VehicleOwnership.PERSONAL,
    ownerId: 'customer',
    currentHubId: 'hub-a',
    parkingSpaceId: 'hub-a-p6',
    batteryLevel: 35,
    capacityKWh: 2,
    status: VehicleStatus.AVAILABLE,
  });
  s.vehicles.set(personal.id, personal);
  Object.assign(s.spaces.get('hub-a-p6')!, {
    vehicleId: personal.id,
    status: SpaceStatus.OCCUPIED,
  });
  s.vehicles.set(
    'personal-2',
    new Vehicle({
      id: 'personal-2',
      code: '59-T2 678.90',
      type: VehicleType.E_MOTORBIKE,
      ownership: VehicleOwnership.PERSONAL,
      ownerId: 'customer',
      batteryLevel: 58,
      capacityKWh: 4,
      status: VehicleStatus.IN_USE,
    }),
  );
  s.vehicles.set(
    'personal-3',
    new Vehicle({
      id: 'personal-3',
      code: '59-T3 111.22',
      type: VehicleType.E_BIKE,
      ownership: VehicleOwnership.PERSONAL,
      ownerId: 'customer2',
      currentHubId: 'hub-b',
      parkingSpaceId: 'hub-b-p4',
      batteryLevel: 25,
      capacityKWh: 2,
      status: VehicleStatus.AVAILABLE,
    }),
  );
  Object.assign(s.spaces.get('hub-b-p4')!, {
    vehicleId: 'personal-3',
    status: SpaceStatus.OCCUPIED,
  });
  const incident = new Incident({
    id: 'incident-demo',
    reporterId: 'customer',
    target: { kind: 'VEHICLE', id: 'hub-bk-v4' },
    description: 'Khóa xe phản hồi chậm, cần kiểm tra trước khi tiếp tục sử dụng.',
    status: IncidentStatus.OPEN,
    createdAt: now - 8 * 60000,
  });
  s.incidents.set(incident.id, incident);
  s.vehicles.get('hub-bk-v4')!.status = VehicleStatus.MAINTENANCE;
  return s;
}
