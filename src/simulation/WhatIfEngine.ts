import {
  NetworkSnapshot,
  Scenario,
  SimulationResult,
  Rental,
  VehicleReservation,
  DispatchOrder,
  ChargingReservation,
  ChargingSession,
  Incident,
} from '../models/entities.js';
import {
  PortStatus,
  ScenarioType,
  SpaceStatus,
  HubStatus,
  VehicleStatus,
  VehicleOwnership,
  ReservationKind,
  ReservationStatus,
  RentalStatus,
  DispatchStatus,
  ChargingSessionStatus,
  IncidentStatus,
} from '../models/enums.js';
import type {
  NetworkState,
  SimulationAction,
  SimulationFrame,
  SimulationMetrics,
} from '../models/types.js';
import { config, minute } from '../shared/config.js';
import { must, ensure } from '../shared/errors.js';
import {
  freeVehicle,
  freeSpace,
  held,
  releaseReservation,
  restoreVehicle,
  restorePort,
  connected,
  powerUsed,
  fault,
  releaseReturnHold,
} from '../shared/business.js';
import { chargingPriority, chargedBattery } from '../shared/scheduling.js';
import { demandRoutes, travelMinutes } from '../data/demand.js';

type Demand = { at: number; from: string; to: string; travel: number };
type Arrival = {
  at: number;
  vehicleId: string;
  spaceId: string;
  reservationId?: string;
  orderId?: string;
  batteryCost: number;
};
type Run = { metrics: SimulationMetrics; frames: SimulationFrame[]; actions: SimulationAction[] };
const step = config.simulationStepMinutes;
const liveCharging = (c: ChargingSession) =>
  [ChargingSessionStatus.ACTIVE, ChargingSessionStatus.AWAITING_DISCONNECT].includes(c.status);

/** A bounded, time-stepped model. It has no reference to the operational repository. */
export class WhatIfEngine {
  constructor(
    private timeoutMs = config.simulationTimeoutMs,
    private now = Date.now,
  ) {}
  simulate(snapshot: NetworkSnapshot, scenario: Scenario): SimulationResult {
    const started = performance.now();
    const checkTime = () =>
      ensure(
        performance.now() - started < this.timeoutMs,
        'SimulationTimeout',
        'Mô phỏng vượt giới hạn thời gian.',
        408,
      );
    ensure(
      Number.isInteger(scenario.horizonMinutes) &&
        scenario.horizonMinutes > 0 &&
        scenario.horizonMinutes <= config.maxScenarioMinutes &&
        scenario.horizonMinutes % step === 0,
      'InvalidScenario',
      'Khoảng khảo sát phải chia hết cho 5 phút và không quá 120 phút.',
      400,
    );
    const original = structuredClone(snapshot.state);
    must(original.hubs, scenario.targetHubId, 'Hub');
    ensure(
      original.hubs.get(scenario.targetHubId)!.status === HubStatus.ACTIVE,
      'InvalidScenario',
      'Chọn Hub đang hoạt động để khảo sát.',
      400,
    );
    const events = this.demand(original, scenario);
    const changed = structuredClone(original);
    const effects = this.applyScenario(changed, scenario);
    const shockEvents =
      scenario.type === ScenarioType.DEMAND_SURGE ? this.surge(events, scenario) : events;
    const baseline = this.run(
      original,
      events,
      scenario,
      snapshot.capturedAt,
      false,
      false,
      checkTime,
    );
    const affected = this.run(
      changed,
      shockEvents,
      scenario,
      snapshot.capturedAt,
      false,
      scenario.type === ScenarioType.CHARGING_SURGE,
      checkTime,
    );
    const coordinated = this.run(
      changed,
      shockEvents,
      scenario,
      snapshot.capturedAt,
      true,
      scenario.type === ScenarioType.CHARGING_SURGE,
      checkTime,
    );
    const improved =
      coordinated.metrics.servedTrips > affected.metrics.servedTrips &&
      coordinated.metrics.lateCharges <= affected.metrics.lateCharges;
    const recommendations = coordinated.actions.map(
      (a) =>
        `${a.type === 'RELOCATE' ? 'Chuyển' : 'Hướng'} ${a.quantity} xe: ${must(original.hubs, a.fromHubId).name} → ${must(original.hubs, a.toHubId).name}, phút ${a.departMinute}–${a.arrivalMinute}. ${a.reason}`,
    );
    if (coordinated.metrics.blockedReturns > affected.metrics.blockedReturns)
      recommendations.push(
        'Phương án phục vụ thêm lượt thuê nhưng làm tăng số yêu cầu gặp thiếu chỗ ở đích. Cần cân nhắc đánh đổi trong bảng so sánh; không coi mọi chỉ số đều được cải thiện.',
      );
    if ([ScenarioType.CHARGING_SURGE, ScenarioType.PORT_FAILURE].includes(scenario.type)) {
      recommendations.push(
        `Theo quy tắc thời điểm cần xe → pin thấp → thứ tự đến, có ${affected.metrics.waitingCharges} yêu cầu còn chờ cuối kỳ; thời gian chờ lớn nhất ghi nhận ${affected.metrics.maxChargeWaitMinutes} phút.`,
      );
      if (affected.metrics.lateCharges)
        recommendations.push(
          `${affected.metrics.lateCharges} yêu cầu không đạt mục tiêu đúng thời điểm cần xe. Cần thỏa thuận lại thời gian hoặc kiểm tra thêm nguồn lực; mô hình không tự tạo cổng hay công suất.`,
        );
      if (scenario.type === ScenarioType.PORT_FAILURE)
        recommendations.push(
          'Ưu tiên kiểm tra cổng lỗi. Chưa giả định sửa chữa xong trong kỳ khảo sát, nên không tính lợi ích của một lần sửa chưa diễn ra.',
        );
    }
    if (!coordinated.actions.length)
      recommendations.push(
        'Không tìm được lệnh điều phối bổ sung phù hợp trong giới hạn nguồn xe, chỗ nhận và thời gian của mô hình.',
      );
    else if (!improved)
      recommendations.push(
        'Phương án thử nghiệm khả thi về tài nguyên nhưng chưa cải thiện chỉ số chính; cần xem bảng so sánh trước khi quyết định.',
      );
    const initialVehicles = [...original.vehicles.values()].filter(
      (v) => v.currentHubId === scenario.targetHubId && freeVehicle(original, v),
    ).length;
    return new SimulationResult({
      scenarioId: scenario.id,
      generatedAt: this.now(),
      metrics: new Map(
        Object.entries({
          baselineVehicles: initialVehicles,
          predictedDemand: affected.metrics.requestedTrips,
          estimatedUnserved: affected.metrics.unservedTrips,
          waitingCharges: affected.metrics.waitingCharges,
          horizonMinutes: scenario.horizonMinutes,
          stepMinutes: step,
          totalVehicles: original.vehicles.size,
        }),
      ),
      comparison: {
        baseline: baseline.metrics,
        scenario: affected.metrics,
        coordinated: coordinated.metrics,
        improved,
      },
      actions: coordinated.actions,
      timeline: affected.frames,
      effects,
      recommendations,
      assumptions: [
        'Mô hình giả lập theo bước 5 phút trên bản sao; không cập nhật dữ liệu vận hành.',
        'Nhu cầu theo tuyến cấu hình sẵn, biến động theo seed. Đây không phải dự báo học từ dữ liệu lịch sử.',
        'Thời gian giữa Hub là giả định 5–15 phút; mỗi chuyến dùng 3% pin. Không tính đường giao thông thực tế.',
        'Chuyến thuê và lệnh đang vận chuyển khi chụp snapshot được giả định đến đích sau 10 phút; lệnh chưa nhận không tự bắt đầu.',
        'Xe được cấp chỗ trả trước khi xuất phát. Chỉ có xe dùng chung đủ pin và chưa bị chiếm dụng được phân bổ.',
        'Người dùng bắt đầu sạc ở bước sau khi được cấp cổng, ngắt kết nối một bước sau khi đạt mục tiêu.',
        'Giữ ít nhất 2 xe khả dụng ở nguồn; tối đa 3 hành động điều phối/chuyển hướng, mỗi lệnh chuyển tối đa 3 xe. Đây là heuristic, không bảo đảm tối ưu toàn cục.',
        'Lượt được phục vụ được tính khi xe xuất phát và có chỗ trả cam kết; xe chưa tới cuối kỳ vẫn đang di chuyển.',
      ],
    });
  }
  private demand(s: NetworkState, scenario: Scenario): Demand[] {
    let seed = scenario.seed >>> 0;
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const active = [...s.hubs.values()].filter((h) => h.status === HubStatus.ACTIVE);
    let routes = demandRoutes.filter(
      (r) => active.some((h) => h.id === r.from) && active.some((h) => h.id === r.to),
    );
    if (!routes.length && active.length >= 2)
      routes = [
        { from: active[0].id, to: active[1].id, every: 2, travel: 10 },
        { from: active[1].id, to: active[0].id, every: 3, travel: 10 },
      ];
    const events: Demand[] = [];
    for (let t = 0; t < scenario.horizonMinutes; t += step)
      for (const r of routes)
        if ((t / step) % r.every === 0) {
          events.push({ at: t, from: r.from, to: r.to, travel: r.travel });
          if (random() < 0.12) events.push({ at: t, from: r.from, to: r.to, travel: r.travel });
        }
    return events;
  }
  private surge(events: Demand[], scenario: Scenario): Demand[] {
    const multiplier = scenario.parameters.get('multiplier') ?? 2;
    const out: Demand[] = [];
    let fraction = 0;
    for (const e of events) {
      out.push(e);
      if (e.from !== scenario.targetHubId) continue;
      fraction += Math.max(0, multiplier - 1);
      while (fraction >= 1) {
        out.push({ ...e });
        fraction--;
      }
    }
    return out;
  }
  private applyScenario(s: NetworkState, scenario: Scenario): string[] {
    const target = must(s.hubs, scenario.targetHubId);
    const effects: string[] = [];
    if (scenario.type === ScenarioType.DEMAND_SURGE)
      effects.push(
        `Tăng nhu cầu đi ra từ ${target.name} ×${scenario.parameters.get('multiplier') ?? 2}.`,
      );
    if (scenario.type === ScenarioType.CHARGING_SURGE)
      effects.push(
        `Tăng số xe đang đỗ đăng ký sạc tại ${target.name} ×${scenario.parameters.get('multiplier') ?? 2}; không tạo yêu cầu trùng xe.`,
      );
    if (scenario.type === ScenarioType.PORT_FAILURE) {
      const ports = [...s.ports.values()]
        .filter(
          (p) =>
            p.hubId === target.id &&
            p.status !== PortStatus.FAULT &&
            !fault(s, 'CHARGING_PORT', p.id),
        )
        .slice(0, scenario.parameters.get('failedPorts') ?? 1);
      ports.forEach((p) => {
        p.status = PortStatus.FAULT;
        const id = `sim-port-failure-${p.id}`;
        s.incidents.set(
          id,
          new Incident({
            id,
            reporterId: 'operator',
            target: { kind: 'CHARGING_PORT', id: p.id },
            description: 'Sự cố giả định trong What-if',
            status: IncidentStatus.OPEN,
            createdAt: 0,
          }),
        );
      });
      effects.push(
        `Giả định ${ports.length} cổng ngừng hoạt động: ${ports.map((p) => p.id).join(', ') || 'không có cổng phù hợp'}. Phiên đang cắm ở cổng lỗi bị tạm ngừng cấp điện.`,
      );
    }
    if ([ScenarioType.HUB_FULL, ScenarioType.VEHICLE_IMBALANCE].includes(scenario.type)) {
      const slots = [...s.spaces.values()].filter((p) => p.hubId === target.id && freeSpace(s, p));
      const count =
        scenario.type === ScenarioType.HUB_FULL
          ? slots.length
          : Math.min(slots.length, scenario.parameters.get('additionalVehicles') ?? 5);
      const donors = [...s.vehicles.values()].filter(
        (v) =>
          v.currentHubId !== target.id &&
          s.hubs.get(v.currentHubId!)?.status === HubStatus.ACTIVE &&
          freeVehicle(s, v),
      );
      let moved = 0;
      for (const v of donors) {
        if (moved >= count) break;
        if (
          [...s.vehicles.values()].filter(
            (x) => x.currentHubId === v.currentHubId && freeVehicle(s, x),
          ).length <= config.dispatchReserveVehicles
        )
          continue;
        const old = must(s.spaces, v.parkingSpaceId!);
        old.vehicleId = undefined;
        old.status = SpaceStatus.FREE;
        const p = slots[moved++];
        p.vehicleId = v.id;
        p.status = SpaceStatus.OCCUPIED;
        v.currentHubId = target.id;
        v.parkingSpaceId = p.id;
      }
      effects.push(
        `Trạng thái đầu vào giả định: chuyển ${moved} xe sẵn sàng từ Hub khác tới ${target.name}, giữ tối thiểu 2 xe ở nguồn. Không thêm hoặc xóa xe.`,
      );
      if (moved < count)
        effects.push(
          `Chỉ tạo được ${moved}/${count} vị trí tập trung mong muốn vì giới hạn tài nguyên; không giả định Hub đầy nếu chưa đủ xe hợp lệ.`,
        );
    }
    return effects;
  }
  private run(
    initial: NetworkState,
    events: Demand[],
    scenario: Scenario,
    startAt: number,
    coordinate: boolean,
    chargingSurge: boolean,
    checkTime: () => void,
  ): Run {
    const s = structuredClone(initial);
    const arrivals: Arrival[] = [];
    const actions: SimulationAction[] = [];
    const frames: SimulationFrame[] = [];
    const heldSince = new Map<string, number>();
    const disconnectAt = new Map<string, number>();
    const waitingTime = new Map<string, number>();
    const chargingCredits = new Map<string, number>();
    let serial = 0;
    const makeId = (kind: string) => `sim-${kind}-${++serial}`;
    const metrics: SimulationMetrics = {
      requestedTrips: 0,
      servedTrips: 0,
      unservedTrips: 0,
      blockedReturns: 0,
      redirectedTrips: 0,
      waitingCharges: 0,
      completedCharges: 0,
      expiredCharges: 0,
      maxChargeWaitMinutes: 0,
      lateCharges: 0,
    };
    for (const r of s.reservations.values())
      if (r.kind === ReservationKind.CHARGING && r.status === ReservationStatus.HELD)
        heldSince.set(r.id, 0);
    for (const c of s.chargingSessions.values())
      if (c.status === ChargingSessionStatus.AWAITING_DISCONNECT) disconnectAt.set(c.id, step);
    for (const r of s.rentals.values())
      if (
        r.status === RentalStatus.ACTIVE &&
        r.plannedReturnSpaceId &&
        s.returnSpaceHolds.get(r.plannedReturnSpaceId) === r.reservationId
      )
        arrivals.push({
          at: 10,
          vehicleId: r.vehicleId,
          spaceId: r.plannedReturnSpaceId,
          reservationId: r.reservationId,
          batteryCost: 3,
        });
    for (const o of s.dispatchOrders.values())
      if (o.status === DispatchStatus.IN_TRANSIT)
        o.vehicleIds.forEach((vehicleId, i) =>
          arrivals.push({
            at: 10,
            vehicleId,
            spaceId: o.reservedSpaceIds[i],
            orderId: o.id,
            batteryCost: 0,
          }),
        );
    const initialCount = s.vehicles.size;
    const modelChargeIds = new Set(
      [...s.reservations.values()]
        .filter(
          (r) =>
            r.kind === ReservationKind.CHARGING &&
            [
              ReservationStatus.WAITING,
              ReservationStatus.HELD,
              ReservationStatus.CONFIRMED,
            ].includes(r.status),
        )
        .map((r) => r.id),
    );
    const available = (hubId: string) =>
      [...s.vehicles.values()].filter((v) => v.currentHubId === hubId && freeVehicle(s, v));
    const slots = (hubId: string) =>
      [...s.spaces.values()].filter((p) => p.hubId === hubId && freeSpace(s, p));
    const activeHubs = () => [...s.hubs.values()].filter((h) => h.status === HubStatus.ACTIVE);
    const relocate = (from: string, to: string, quantity: number, t: number, reason: string) => {
      const selected = available(from).slice(0, quantity);
      const places = slots(to).slice(0, quantity);
      if (selected.length !== quantity || places.length !== quantity || quantity <= 0) return;
      const orderId = makeId('order');
      s.dispatchOrders.set(
        orderId,
        new DispatchOrder({
          id: orderId,
          creatorId: 'operator',
          fromHubId: from,
          toHubId: to,
          vehicleIds: selected.map((v) => v.id),
          reservedSpaceIds: places.map((p) => p.id),
          status: DispatchStatus.IN_TRANSIT,
          createdAt: startAt + t * minute,
        }),
      );
      selected.forEach((v, i) => {
        const old = must(s.spaces, v.parkingSpaceId!);
        old.vehicleId = undefined;
        old.status = SpaceStatus.FREE;
        v.currentHubId = undefined;
        v.parkingSpaceId = undefined;
        v.status = VehicleStatus.IN_TRANSIT;
        const p = places[i];
        p.status = SpaceStatus.HELD;
        s.dispatchSpaceHolds.set(p.id, orderId);
        arrivals.push({
          at: t + travelMinutes(from, to),
          vehicleId: v.id,
          spaceId: p.id,
          orderId,
          batteryCost: 0,
        });
      });
      actions.push({
        type: 'RELOCATE',
        fromHubId: from,
        toHubId: to,
        quantity,
        departMinute: t,
        arrivalMinute: t + travelMinutes(from, to),
        reason,
      });
    };
    for (let t = 0; t <= scenario.horizonMinutes; t += step) {
      checkTime();
      const ts = startAt + t * minute;
      for (const r of s.reservations.values())
        if (held(r) && r.expiresAt <= ts) {
          r.status = ReservationStatus.EXPIRED;
          releaseReservation(s, r);
          if (r.kind === ReservationKind.CHARGING) metrics.expiredCharges++;
        }
      for (let i = arrivals.length - 1; i >= 0; i--) {
        const a = arrivals[i];
        if (a.at > t) continue;
        const v = must(s.vehicles, a.vehicleId);
        const p = must(s.spaces, a.spaceId);
        ensure(
          p.status === SpaceStatus.HELD &&
            !p.vehicleId &&
            (a.orderId
              ? s.dispatchSpaceHolds.get(p.id) === a.orderId
              : s.returnSpaceHolds.get(p.id) === a.reservationId),
          'SimulationInvariant',
          'Chỗ nhận mô phỏng không còn đúng cam kết.',
        );
        p.status = SpaceStatus.OCCUPIED;
        p.vehicleId = v.id;
        v.currentHubId = p.hubId;
        v.parkingSpaceId = p.id;
        v.batteryLevel = Math.max(0, v.batteryLevel - a.batteryCost);
        if (a.reservationId) {
          s.returnSpaceHolds.delete(p.id);
          const r = must(s.reservations, a.reservationId);
          r.status = ReservationStatus.COMPLETED;
          const rental = [...s.rentals.values()].find(
            (x) => x.reservationId === r.id && x.status === RentalStatus.ACTIVE,
          );
          if (rental) {
            rental.status = RentalStatus.COMPLETED;
            rental.returnHubId = p.hubId;
            rental.endedAt = ts;
          }
        }
        if (a.orderId) {
          s.dispatchSpaceHolds.delete(p.id);
          const o = must(s.dispatchOrders, a.orderId);
          if (o.vehicleIds.every((id) => s.vehicles.get(id)?.currentHubId === o.toHubId)) {
            o.status = DispatchStatus.COMPLETED;
            for (const id of o.vehicleIds) restoreVehicle(s, must(s.vehicles, id));
          }
        }
        restoreVehicle(s, v);
        arrivals.splice(i, 1);
      }
      for (const c of s.chargingSessions.values()) {
        const v = must(s.vehicles, c.vehicleId);
        const p = must(s.ports, c.portId);
        if (c.status === ChargingSessionStatus.ACTIVE && t > 0) {
          if (
            !fault(s, 'VEHICLE', v.id) &&
            !fault(s, 'CHARGING_PORT', p.id) &&
            p.status !== PortStatus.FAULT
          ) {
            v.batteryLevel = chargedBattery(
              v.batteryLevel,
              c.targetBattery,
              p.powerKw,
              v.capacityKWh,
              step * minute,
            );
            if (v.batteryLevel >= c.targetBattery) {
              c.status = ChargingSessionStatus.AWAITING_DISCONNECT;
              c.stopReason = 'TARGET';
              c.stoppedAt = ts;
              disconnectAt.set(c.id, t + step);
              restorePort(s, p.id);
              metrics.completedCharges++;
            }
          }
          c.updatedAt = ts;
        }
        if (
          c.status === ChargingSessionStatus.AWAITING_DISCONNECT &&
          (disconnectAt.get(c.id) ?? Infinity) <= t
        ) {
          c.status = ChargingSessionStatus.COMPLETED;
          c.endedAt = ts;
          must(s.reservations, c.reservationId).status = ReservationStatus.COMPLETED;
          restorePort(s, p.id);
          restoreVehicle(s, v);
        }
      }
      // Existing and generated users accept a held connector at the following model step.
      for (const r of s.reservations.values())
        if (
          r.kind === ReservationKind.CHARGING &&
          r.status === ReservationStatus.HELD &&
          (heldSince.get(r.id) ?? t) + step <= t &&
          r.portId
        ) {
          const v = must(s.vehicles, r.vehicleId);
          const p = must(s.ports, r.portId);
          if (
            p.status !== PortStatus.HELD ||
            fault(s, 'CHARGING_PORT', p.id) ||
            fault(s, 'VEHICLE', v.id) ||
            connected(s, v.id)
          )
            continue;
          const id = makeId('charge');
          s.chargingSessions.set(
            id,
            new ChargingSession({
              id,
              reservationId: r.id,
              vehicleId: v.id,
              portId: p.id,
              startedAt: ts,
              updatedAt: ts,
              targetBattery: r.targetBattery,
              status: ChargingSessionStatus.ACTIVE,
            }),
          );
          r.status = ReservationStatus.CONFIRMED;
          p.status = PortStatus.CHARGING;
          v.status = VehicleStatus.CHARGING;
        }
      const shortages = new Map<string, number>();
      if (t < scenario.horizonMinutes)
        for (const e of events.filter((e) => e.at === t)) {
          metrics.requestedTrips++;
          const v = available(e.from)[0];
          if (!v) {
            metrics.unservedTrips++;
            shortages.set(e.from, (shortages.get(e.from) ?? 0) + 1);
            continue;
          }
          let destination = e.to;
          let p = slots(destination)[0];
          if (!p && coordinate && actions.length < config.maxSimulationActions) {
            const alternative = activeHubs()
              .filter((h) => h.id !== e.from && h.id !== e.to && slots(h.id).length > 0)
              .sort(
                (a, b) =>
                  travelMinutes(e.to, a.id) - travelMinutes(e.to, b.id) || a.id.localeCompare(b.id),
              )[0];
            if (alternative) {
              destination = alternative.id;
              p = slots(destination)[0];
              metrics.redirectedTrips++;
              actions.push({
                type: 'REDIRECT',
                fromHubId: e.from,
                toHubId: destination,
                originalDestinationHubId: e.to,
                quantity: 1,
                departMinute: t,
                arrivalMinute: t + travelMinutes(e.from, destination),
                reason: `Hub đích ${must(s.hubs, e.to).name} thiếu chỗ; chỗ nhận tại Hub thay thế đã được giữ trong mô hình.`,
              });
            }
          }
          if (!p) {
            metrics.unservedTrips++;
            metrics.blockedReturns++;
            continue;
          }
          const reservationId = makeId('trip-res');
          const rentalId = makeId('rental');
          const old = must(s.spaces, v.parkingSpaceId!);
          old.vehicleId = undefined;
          old.status = SpaceStatus.FREE;
          p.status = SpaceStatus.HELD;
          s.returnSpaceHolds.set(p.id, reservationId);
          s.reservations.set(
            reservationId,
            new VehicleReservation({
              id: reservationId,
              kind: ReservationKind.VEHICLE,
              userId: 'simulation',
              hubId: e.from,
              vehicleId: v.id,
              pickupCode: 'simulation',
              createdAt: ts,
              expiresAt: ts + 15 * minute,
              extensionCount: 0,
              status: ReservationStatus.CONFIRMED,
              plannedReturnHubId: destination,
              plannedReturnSpaceId: p.id,
            }),
          );
          s.rentals.set(
            rentalId,
            new Rental({
              id: rentalId,
              userId: 'simulation',
              vehicleId: v.id,
              reservationId,
              pickupHubId: e.from,
              plannedReturnHubId: destination,
              plannedReturnSpaceId: p.id,
              startedAt: ts,
              fee: 0,
              penalty: 0,
              status: RentalStatus.ACTIVE,
            }),
          );
          v.currentHubId = undefined;
          v.parkingSpaceId = undefined;
          v.status = VehicleStatus.IN_USE;
          arrivals.push({
            at: t + (destination === e.to ? e.travel : travelMinutes(e.from, destination)),
            vehicleId: v.id,
            spaceId: p.id,
            reservationId,
            batteryCost: 3,
          });
          metrics.servedTrips++;
        }
      // Charge requests always reference real, parked vehicles; one live request per vehicle.
      if (t < scenario.horizonMinutes && t % 10 === 0)
        for (const h of activeHubs()) {
          const credit =
            (chargingCredits.get(h.id) ?? 0) +
            (chargingSurge && h.id === scenario.targetHubId
              ? (scenario.parameters.get('multiplier') ?? 2)
              : 1);
          const count = Math.floor(credit);
          chargingCredits.set(h.id, credit - count);
          const eligible = [...s.vehicles.values()]
            .filter(
              (v) =>
                v.currentHubId === h.id &&
                v.parkingSpaceId &&
                v.status === VehicleStatus.AVAILABLE &&
                !fault(s, 'VEHICLE', v.id) &&
                v.batteryLevel < 40 &&
                !connected(s, v.id) &&
                ![...s.reservations.values()].some((r) => r.vehicleId === v.id && held(r)),
            )
            .sort((a, b) => a.batteryLevel - b.batteryLevel || a.id.localeCompare(b.id))
            .slice(0, count);
          for (const v of eligible) {
            const id = makeId('charge-res');
            s.reservations.set(
              id,
              new ChargingReservation({
                id,
                kind: ReservationKind.CHARGING,
                userId: v.ownerId ?? 'operator',
                hubId: h.id,
                vehicleId: v.id,
                targetBattery: 80,
                requiredBy: ts + 40 * minute,
                createdAt: ts,
                expiresAt: ts + 60 * minute,
                extensionCount: 0,
                status: ReservationStatus.WAITING,
              }),
            );
            modelChargeIds.add(id);
          }
        }
      const queue = [...s.reservations.values()]
        .filter(
          (r): r is ChargingReservation =>
            r.kind === ReservationKind.CHARGING && r.status === ReservationStatus.WAITING,
        )
        .sort((a, b) => chargingPriority(a, b, s.vehicles));
      for (const r of queue) {
        const v = must(s.vehicles, r.vehicleId);
        const h = must(s.hubs, r.hubId);
        if (
          h.status !== HubStatus.ACTIVE ||
          v.currentHubId !== h.id ||
          !v.parkingSpaceId ||
          fault(s, 'VEHICLE', v.id) ||
          connected(s, v.id) ||
          v.batteryLevel >= r.targetBattery
        )
          continue;
        const p = [...s.ports.values()].find(
          (p) =>
            p.hubId === h.id &&
            p.status === PortStatus.FREE &&
            !fault(s, 'CHARGING_PORT', p.id) &&
            (!r.preferredPortId || p.id === r.preferredPortId) &&
            powerUsed(s, h.id) + p.powerKw <= h.chargingBudgetKw,
        );
        if (p) {
          r.portId = p.id;
          r.status = ReservationStatus.HELD;
          r.expiresAt = ts + 15 * minute;
          p.status = PortStatus.HELD;
          heldSince.set(r.id, t);
        }
      }
      if (
        coordinate &&
        t < scenario.horizonMinutes &&
        actions.length < config.maxSimulationActions
      ) {
        // First relieve a nearly full hub if it has enough free shared vehicles.
        const full = activeHubs().find(
          (h) =>
            slots(h.id).length === 0 && available(h.id).length > config.dispatchReserveVehicles + 1,
        );
        if (full) {
          const destination = activeHubs()
            .filter((h) => h.id !== full.id && slots(h.id).length >= 2)
            .sort(
              (a, b) => available(a.id).length - available(b.id).length || a.id.localeCompare(b.id),
            )[0];
          if (destination && t + travelMinutes(full.id, destination.id) <= scenario.horizonMinutes)
            relocate(
              full.id,
              destination.id,
              Math.min(
                config.maxDispatchVehicles,
                available(full.id).length - config.dispatchReserveVehicles,
                slots(destination.id).length,
              ),
              t,
              'Giải phóng sức chứa ở Hub đầy; vẫn giữ xe dự phòng tại nguồn.',
            );
        }
        for (const [target, missing] of shortages) {
          if (actions.length >= config.maxSimulationActions) break;
          if (
            actions.some(
              (a) => a.type === 'RELOCATE' && a.toHubId === target && a.arrivalMinute > t,
            )
          )
            continue;
          const donor = activeHubs()
            .filter(
              (h) =>
                h.id !== target &&
                available(h.id).length > config.dispatchReserveVehicles &&
                t + travelMinutes(h.id, target) <= scenario.horizonMinutes,
            )
            .sort(
              (a, b) =>
                available(b.id).length - available(a.id).length ||
                travelMinutes(a.id, target) - travelMinutes(b.id, target) ||
                a.id.localeCompare(b.id),
            )[0];
          if (donor)
            relocate(
              donor.id,
              target,
              Math.min(
                missing,
                config.maxDispatchVehicles,
                available(donor.id).length - config.dispatchReserveVehicles,
                slots(target).length,
              ),
              t,
              'Bổ sung cho các bước sau khi phát hiện thiếu xe; không phục hồi các lượt đã bị từ chối trước đó.',
            );
        }
      }
      for (const r of s.reservations.values())
        if (
          r.kind === ReservationKind.CHARGING &&
          [ReservationStatus.WAITING, ReservationStatus.HELD].includes(r.status) &&
          t < scenario.horizonMinutes
        )
          waitingTime.set(r.id, (waitingTime.get(r.id) ?? 0) + step);
      this.validate(s, initialCount);
      frames.push({
        minute: t,
        availableVehicles: [...s.vehicles.values()].filter(
          (v) => s.hubs.get(v.currentHubId!)?.status === HubStatus.ACTIVE && freeVehicle(s, v),
        ).length,
        waitingCharges: [...s.reservations.values()].filter(
          (r) => r.kind === ReservationKind.CHARGING && r.status === ReservationStatus.WAITING,
        ).length,
        unservedTrips: metrics.unservedTrips,
        hubs: activeHubs().map((h) => ({
          hubId: h.id,
          availableVehicles: available(h.id).length,
          occupiedSpaces: [...s.spaces.values()].filter(
            (p) => p.hubId === h.id && p.status === SpaceStatus.OCCUPIED,
          ).length,
          heldSpaces: [...s.spaces.values()].filter(
            (p) => p.hubId === h.id && p.status === SpaceStatus.HELD,
          ).length,
          capacity: [...s.spaces.values()].filter((p) => p.hubId === h.id).length,
          freePorts: [...s.ports.values()].filter(
            (p) =>
              p.hubId === h.id && p.status === PortStatus.FREE && !fault(s, 'CHARGING_PORT', p.id),
          ).length,
          faultPorts: [...s.ports.values()].filter(
            (p) => p.hubId === h.id && p.status === PortStatus.FAULT,
          ).length,
          chargingKw: powerUsed(s, h.id),
        })),
      });
    }
    metrics.waitingCharges = [...s.reservations.values()].filter(
      (r) =>
        r.kind === ReservationKind.CHARGING &&
        [ReservationStatus.WAITING, ReservationStatus.HELD].includes(r.status),
    ).length;
    metrics.maxChargeWaitMinutes = Math.max(0, ...waitingTime.values());
    metrics.lateCharges = [...s.reservations.values()]
      .filter(
        (r): r is ChargingReservation =>
          r.kind === ReservationKind.CHARGING &&
          modelChargeIds.has(r.id) &&
          r.requiredBy !== undefined &&
          r.requiredBy <= startAt + scenario.horizonMinutes * minute,
      )
      .filter((r) => {
        const c = [...s.chargingSessions.values()].find((c) => c.reservationId === r.id);
        return c?.stopReason !== 'MANUAL' && (!c?.stoppedAt || c.stoppedAt > r.requiredBy!);
      }).length;
    return { metrics, frames, actions };
  }
  private validate(s: NetworkState, total: number): void {
    ensure(s.vehicles.size === total, 'SimulationInvariant', 'Mô phỏng làm thay đổi tổng số xe.');
    const seen = new Set<string>();
    for (const p of s.spaces.values())
      if (p.vehicleId) {
        const v = must(s.vehicles, p.vehicleId);
        ensure(
          !seen.has(v.id) &&
            p.status === SpaceStatus.OCCUPIED &&
            v.parkingSpaceId === p.id &&
            v.currentHubId === p.hubId,
          'SimulationInvariant',
          'Xe hoặc chỗ đỗ bị trùng trong mô phỏng.',
        );
        seen.add(v.id);
      }
    for (const v of s.vehicles.values())
      if (v.parkingSpaceId)
        ensure(
          s.spaces.get(v.parkingSpaceId)?.vehicleId === v.id,
          'SimulationInvariant',
          'Liên kết vị trí xe không nhất quán.',
        );
    for (const [spaceId, owner] of s.returnSpaceHolds)
      ensure(
        s.spaces.get(spaceId)?.status === SpaceStatus.HELD &&
          !s.spaces.get(spaceId)?.vehicleId &&
          s.reservations.has(owner),
        'SimulationInvariant',
        'Chỗ trả bị cấp trùng.',
      );
    for (const [spaceId, owner] of s.dispatchSpaceHolds)
      ensure(
        s.spaces.get(spaceId)?.status === SpaceStatus.HELD &&
          !s.spaces.get(spaceId)?.vehicleId &&
          s.dispatchOrders.has(owner) &&
          !s.returnSpaceHolds.has(spaceId),
        'SimulationInvariant',
        'Chỗ điều phối bị cấp trùng.',
      );
    const ports = new Set<string>();
    const vehicles = new Set<string>();
    for (const c of s.chargingSessions.values())
      if (liveCharging(c)) {
        ensure(
          !ports.has(c.portId) && !vehicles.has(c.vehicleId),
          'SimulationInvariant',
          'Cổng hoặc xe có nhiều phiên sạc cùng lúc.',
        );
        ports.add(c.portId);
        vehicles.add(c.vehicleId);
      }
    for (const h of s.hubs.values())
      ensure(
        powerUsed(s, h.id) <= h.chargingBudgetKw + 1e-8,
        'SimulationInvariant',
        'Mô phỏng vượt ngân sách công suất.',
      );
    for (const p of s.ports.values())
      if (fault(s, 'CHARGING_PORT', p.id))
        ensure(
          p.status === PortStatus.FAULT,
          'SimulationInvariant',
          'Cổng lỗi không được tự trở lại phục vụ.',
        );
  }
}
