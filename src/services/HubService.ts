import { Hub, Vehicle, ParkingSpace, ChargingPort } from '../models/entities.js';
import {
  HubStatus,
  Role,
  SpaceStatus,
  PortStatus,
  IncidentStatus,
  DispatchStatus,
  ChargingSessionStatus,
  ReservationStatus,
  ReservationKind,
  VehicleType,
  VehicleOwnership,
} from '../models/enums.js';
import type {
  HubSearchDTO,
  HubSummaryDTO,
  HubDetailDTO,
  NetworkSummaryDTO,
} from '../models/types.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import {
  actor,
  freeVehicle,
  fault,
  freeSpace,
  powerUsed,
  totalChargingPower,
} from '../shared/business.js';
import { travelMinutes } from '../data/demand.js';
import { must, numeric, ensure } from '../shared/errors.js';
export class HubService {
  constructor(private repo: InMemoryRepository) {}
  search(criteria: HubSearchDTO): HubSummaryDTO[] {
    if (criteria.minBattery !== undefined) numeric(criteria.minBattery, 'Pin tối thiểu', 0, 100);
    if (criteria.vehicleType)
      ensure(
        Object.values(VehicleType).includes(criteria.vehicleType),
        'ValidationError',
        'Loại xe không hợp lệ.',
        400,
      );
    const s = this.repo.snapshot().state;
    return [...s.hubs.values()]
      .filter(
        (h) =>
          !criteria.area ||
          h.name.toLocaleLowerCase('vi').includes(String(criteria.area).toLocaleLowerCase('vi')),
      )
      .filter((h) => !criteria.routeHubIds?.length || criteria.routeHubIds.includes(h.id))
      .map((h) => {
        const summary = this.summary(h.id);
        const vehicles = [...s.vehicles.values()].filter(
          (v) =>
            v.currentHubId === h.id &&
            freeVehicle(s, v) &&
            (!criteria.vehicleType || v.type === criteria.vehicleType) &&
            v.batteryLevel >= (criteria.minBattery ?? 0),
        );
        summary.availableVehicles = vehicles.length;
        return summary;
      })
      .filter(
        (h) =>
          (!criteria.needsParking || h.freeSpaces > 0) &&
          (!criteria.needsCharging || h.freePorts > 0) &&
          ((!criteria.vehicleType && criteria.minBattery === undefined) || h.availableVehicles > 0),
      );
  }
  getDetail(hubId: string): HubDetailDTO {
    const s = this.repo.snapshot().state;
    const hub = must(s.hubs, hubId, 'Hub');
    return {
      ...this.summary(hubId),
      vehicles: [...s.vehicles.values()]
        .filter((v) => v.currentHubId === hubId && v.ownership === VehicleOwnership.SHARED)
        .map((v) => ({ ...v, rentable: hub.status === HubStatus.ACTIVE && freeVehicle(s, v) })),
      spaces: [...s.spaces.values()].filter((p) => p.hubId === hubId),
      ports: [...s.ports.values()].filter((p) => p.hubId === hubId),
    };
  }
  getNetworkStatus(operatorId: string): NetworkSummaryDTO {
    const s = this.repo.snapshot().state;
    actor(s, operatorId, [Role.OPERATOR]);
    return {
      hubs: [...s.hubs.keys()].map((h) => this.summary(h)),
      vehicles: s.vehicles.size,
      availableVehicles: [...s.vehicles.values()].filter((v) => freeVehicle(s, v)).length,
      occupiedSpaces: [...s.spaces.values()].filter((p) => p.status === SpaceStatus.OCCUPIED)
        .length,
      totalSpaces: s.spaces.size,
      chargingSessions: [...s.chargingSessions.values()].filter(
        (c) => c.status === ChargingSessionStatus.ACTIVE,
      ).length,
      openIncidents: [...s.incidents.values()].filter((i) => i.status !== IncidentStatus.RESOLVED)
        .length,
      pendingDispatches: [...s.dispatchOrders.values()].filter(
        (o) => o.status === DispatchStatus.PENDING,
      ).length,
      waitingCharges: [...s.reservations.values()].filter(
        (r) => r.kind === ReservationKind.CHARGING && r.status === ReservationStatus.WAITING,
      ).length,
    };
  }
  private summary(hubId: string): HubSummaryDTO {
    const s = this.repo.snapshot().state;
    const h = must(s.hubs, hubId);
    const vehicles = [...s.vehicles.values()].filter(
      (v) => v.currentHubId === hubId && freeVehicle(s, v),
    );
    const spaces = [...s.spaces.values()].filter((p) => p.hubId === hubId);
    const ports = [...s.ports.values()].filter((p) => p.hubId === hubId);
    return {
      ...h,
      travelMinutesTo: Object.fromEntries(
        [...s.hubs.keys()].map((other) => [other, travelMinutes(h.id, other)]),
      ),
      chargingBudgetKw: totalChargingPower(s, h.id),
      chargingTotalKw: totalChargingPower(s, h.id),
      chargingActiveKw: ports
        .filter((p) => p.status === PortStatus.CHARGING && !fault(s, 'CHARGING_PORT', p.id))
        .reduce((sum, p) => sum + p.powerKw, 0),
      totalPorts: ports.length,
      activePorts: ports.filter((p) => p.status === PortStatus.CHARGING).length,
      heldPorts: ports.filter((p) => p.status === PortStatus.HELD).length,
      connectedPorts: ports.filter((p) => p.status === PortStatus.CONNECTED).length,
      faultPorts: ports.filter(
        (p) => p.status === PortStatus.FAULT || fault(s, 'CHARGING_PORT', p.id),
      ).length,
      availableVehicles: h.status === HubStatus.ACTIVE ? vehicles.length : 0,
      freeSpaces: h.status === HubStatus.ACTIVE ? spaces.filter((p) => freeSpace(s, p)).length : 0,
      totalSpaces: spaces.length,
      freePorts:
        h.status !== HubStatus.ACTIVE
          ? 0
          : ports.filter((p) => p.status === PortStatus.FREE && !fault(s, 'CHARGING_PORT', p.id))
              .length,
      chargingUsedKw: powerUsed(s, h.id),
      chargingAvailableKw:
        h.status === HubStatus.ACTIVE
          ? ports
              .filter((p) => p.status === PortStatus.FREE && !fault(s, 'CHARGING_PORT', p.id))
              .reduce((sum, p) => sum + p.powerKw, 0)
          : 0,
      batteryAverage: vehicles.length
        ? Math.round(vehicles.reduce((n, v) => n + v.batteryLevel, 0) / vehicles.length)
        : 0,
    };
  }
}
