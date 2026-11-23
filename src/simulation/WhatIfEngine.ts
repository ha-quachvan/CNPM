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
  totalChargingPower,
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
    const checkTime = this.timeGuard();
    const { original, changed, events, shockEvents, effects } = this.prepare(snapshot, scenario);
    const surge = scenario.type === ScenarioType.CHARGING_SURGE;
    const baseline = this.run(original, events, scenario, snapshot.capturedAt, false, checkTime);
    const affected = this.run(
      changed,
      shockEvents,
      scenario,
      snapshot.capturedAt,
      surge,
      checkTime,
    );
    const candidates = this.candidates(changed, scenario);
    let best: { action: SimulationAction; metrics: SimulationMetrics } | undefined;
    for (const action of candidates) {
      checkTime();
      const trial = this.run(
        changed,
        shockEvents,
        scenario,
        snapshot.capturedAt,
        surge,
        checkTime,
        action,
      );
      // A concise recommendation must improve service without increasing parking refusals or late charging.
      if (
        trial.metrics.servedTrips <= affected.metrics.servedTrips ||
        trial.metrics.blockedReturns > affected.metrics.blockedReturns ||
        trial.metrics.lateCharges > affected.metrics.lateCharges
      )
        continue;
      const rank = (value: { action: SimulationAction; metrics: SimulationMetrics }) => [
        -value.metrics.servedTrips,
        value.metrics.blockedReturns,
        value.metrics.lateCharges,
        value.action.arrivalMinute,
        value.action.quantity,
      ];
      const candidate = { action, metrics: trial.metrics };
      const order = best
        ? (rank(candidate)
            .map((v, i) => v - rank(best!)[i])
            .find((v) => v !== 0) ?? 0)
        : -1;
      if (!best || order < 0) best = candidate;
    }
    const charging = [ScenarioType.CHARGING_SURGE, ScenarioType.PORT_FAILURE].includes(
      scenario.type,
    );
    const recommendations = best
      ? [
          `Thử chuyển ${best.action.quantity} xe từ ${must(original.hubs, best.action.fromHubId).name} tới ${must(original.hubs, best.action.toHubId).name}; xe đến sau ${best.action.arrivalMinute} phút.`,
        ]
      : charging
        ? [
            scenario.type === ScenarioType.PORT_FAILURE
              ? 'Cử kỹ thuật viên kiểm tra cổng lỗi; chưa giả định cổng đã sửa xong.'
              : 'Theo dõi hàng chờ và thông báo các yêu cầu có nguy cơ không đạt pin đúng hạn.',
          ]
        : ['Chưa tìm được lệnh điều chuyển cải thiện kết quả trong các phương án đã xét.'];
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
      comparison: { baseline: baseline.metrics, scenario: affected.metrics },
      proposal: best ? { action: best.action, candidatesTested: candidates.length } : undefined,
      candidatesTested: candidates.length,
      scope: {
        scenarioType: scenario.type,
        targetHubId: scenario.targetHubId,
        targetHubName: must(original.hubs, scenario.targetHubId).name,
        horizonMinutes: scenario.horizonMinutes,
        normalOutboundRequests: events.filter((e) => e.from === scenario.targetHubId).length,
        scenarioOutboundRequests: shockEvents.filter((e) => e.from === scenario.targetHubId).length,
        initialAvailableVehicles: initialVehicles,
        scenarioAvailableVehicles: [...changed.vehicles.values()].filter(
          (v) => v.currentHubId === scenario.targetHubId && freeVehicle(changed, v),
        ).length,
        initialUsablePorts: [...original.ports.values()].filter(
          (p) =>
            p.hubId === scenario.targetHubId &&
            p.status !== PortStatus.FAULT &&
            !fault(original, 'CHARGING_PORT', p.id),
        ).length,
        scenarioUsablePorts: [...changed.ports.values()].filter(
          (p) =>
            p.hubId === scenario.targetHubId &&
            p.status !== PortStatus.FAULT &&
            !fault(changed, 'CHARGING_PORT', p.id),
        ).length,
        totalPorts: [...original.ports.values()].filter((p) => p.hubId === scenario.targetHubId)
          .length,
      },
      actions: best ? [best.action] : [],
      timeline: affected.frames,
      effects,
      recommendations,
      assumptions: [
        'Mô hình theo bước 5 phút trên bản sao. Số lượt thuê và chỉ số sạc tính trên toàn mạng lưới; chỉ tình huống được áp dụng tại Hub đã chọn.',
        'Nhu cầu theo tuyến và seed giả lập, không phải dự báo học từ lịch sử. Thời gian giữa Hub lấy từ cùng bảng dùng trên bản đồ mô phỏng.',
        'Mỗi chuyến dùng 3% pin. Xe phải đủ điều kiện và được giữ chỗ trả trước khi xuất phát; xe chỉ phục vụ tiếp khi đã đến nơi.',
        'Chuyến thuê/lệnh đang vận chuyển lúc chụp dữ liệu được giả định đến sau 10 phút; lệnh chưa nhận không tự bắt đầu.',
        'Cấp cổng theo hạn cần xe, pin, thời điểm tạo. Mỗi cổng phục vụ một xe; bắt đầu và rút dây ở bước kế tiếp. Công suất Hub bằng tổng định mức các cổng.',
        'Mỗi phương án chỉ có một lệnh điều chuyển ngay đầu kỳ, tối đa 3 xe và giữ ít nhất 2 xe khả dụng ở nguồn. So sánh tối đa 12 phương án; chưa bảo đảm tối ưu toàn cục.',
        'Chỉ đề xuất nếu tăng lượt phục vụ, không tăng từ chối do thiếu chỗ trả hoặc sạc trễ. Không tự đổi Hub trả hoặc tự tạo lệnh vận hành.',
        'Cổng lỗi không tự được sửa trong khoảng mô phỏng. Chưa tính lợi ích của sửa chữa chưa diễn ra.',
      ],
    });
  }
  evaluate(
    snapshot: NetworkSnapshot,
    scenario: Scenario,
    action: SimulationAction,
  ): import('../models/types.js').SimulationTrial {
    const checkTime = this.timeGuard();
    const { changed, shockEvents } = this.prepare(snapshot, scenario);
    this.validateAction(changed, scenario, action);
    const surge = scenario.type === ScenarioType.CHARGING_SURGE;
    const before = this.run(changed, shockEvents, scenario, snapshot.capturedAt, surge, checkTime);
    const after = this.run(
      changed,
      shockEvents,
      scenario,
      snapshot.capturedAt,
      surge,
      checkTime,
      action,
    );
    return {
      scenarioId: scenario.id,
      evaluatedAt: this.now(),
      action: structuredClone(action),
      before: before.metrics,
      after: after.metrics,
      timeline: after.frames,
    };
  }
  private timeGuard(): () => void {
    const started = performance.now();
    return () =>
      ensure(
        performance.now() - started < this.timeoutMs,
        'SimulationTimeout',
        'Mô phỏng vượt giới hạn thời gian.',
        408,
      );
  }
  private prepare(snapshot: NetworkSnapshot, scenario: Scenario) {
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
    ensure(
      must(original.hubs, scenario.targetHubId, 'Hub').status === HubStatus.ACTIVE,
      'InvalidScenario',
      'Chọn Hub đang hoạt động để khảo sát.',
      400,
    );
    const events = this.demand(original, scenario);
    const changed = structuredClone(original);
    const effects = this.applyScenario(changed, scenario);
    const shockEvents =
      scenario.type === ScenarioType.DEMAND_SURGE ? this.surge(events, scenario) : events;
    return { original, changed, events, shockEvents, effects };
  }
  private candidates(s: NetworkState, scenario: Scenario): SimulationAction[] {
    if ([ScenarioType.CHARGING_SURGE, ScenarioType.PORT_FAILURE].includes(scenario.type)) return [];
    const result: SimulationAction[] = [];
    const available = (hubId: string) =>
      [...s.vehicles.values()].filter((v) => v.currentHubId === hubId && freeVehicle(s, v)).length;
    const slots = (hubId: string) =>
      [...s.spaces.values()].filter((p) => p.hubId === hubId && freeSpace(s, p)).length;
    const incoming = scenario.type === ScenarioType.DEMAND_SURGE;
    const others = [...s.hubs.values()]
      .filter((h) => h.id !== scenario.targetHubId && h.status === HubStatus.ACTIVE)
      .sort(
        (a, b) =>
          travelMinutes(a.id, scenario.targetHubId) - travelMinutes(b.id, scenario.targetHubId) ||
          a.id.localeCompare(b.id),
      );
    for (const other of others) {
      const fromHubId = incoming ? other.id : scenario.targetHubId;
      const toHubId = incoming ? scenario.targetHubId : other.id;
      const arrivalMinute = travelMinutes(fromHubId, toHubId);
      if (arrivalMinute >= scenario.horizonMinutes) continue;
      const max = Math.min(
        config.maxDispatchVehicles,
        available(fromHubId) - config.dispatchReserveVehicles,
        slots(toHubId),
      );
      for (let quantity = 1; quantity <= max; quantity++) {
        if (result.length >= config.maxSimulationCandidates) return result;
        result.push({
          type: 'RELOCATE',
          fromHubId,
          toHubId,
          quantity,
          departMinute: 0,
          arrivalMinute,
          reason: incoming
            ? 'Bổ sung xe cho Hub tăng nhu cầu; xe chỉ được phục vụ sau khi đến nơi.'
            : 'Giải phóng chỗ tại Hub tập trung nhiều xe; vẫn giữ xe dự phòng tại nguồn.',
        });
      }
    }
    return result;
  }
  private validateAction(s: NetworkState, scenario: Scenario, action: SimulationAction): void {
    const valid = this.candidates(s, scenario).some(
      (a) =>
        a.type === action.type &&
        a.fromHubId === action.fromHubId &&
        a.toHubId === action.toHubId &&
        a.quantity === action.quantity &&
        a.departMinute === action.departMinute &&
        a.arrivalMinute === action.arrivalMinute,
    );
    ensure(
      valid,
      'InvalidSimulationPlan',
      'Lệnh thử không phù hợp với xe nguồn, chỗ nhận hoặc thời gian khảo sát.',
      400,
    );
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
    chargingSurge: boolean,
    checkTime: () => void,
    plannedAction?: SimulationAction,
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
    if (plannedAction) {
      this.validateAction(s, scenario, plannedAction);
      relocate(
        plannedAction.fromHubId,
        plannedAction.toHubId,
        plannedAction.quantity,
        0,
        plannedAction.reason,
      );
      ensure(
        actions.length === 1,
        'InvalidSimulationPlan',
        'Không thể giữ đủ xe và chỗ nhận cho lệnh thử.',
        409,
      );
    }
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
      if (t < scenario.horizonMinutes)
        for (const e of events.filter((e) => e.at === t)) {
          metrics.requestedTrips++;
          const v = available(e.from)[0];
          if (!v) {
            metrics.unservedTrips++;
            continue;
          }
          const destination = e.to;
          const p = slots(destination)[0];
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
            at: t + e.travel,
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
            (!r.preferredPortId || p.id === r.preferredPortId),
        );
        if (p) {
          r.portId = p.id;
          r.status = ReservationStatus.HELD;
          r.expiresAt = ts + 15 * minute;
          p.status = PortStatus.HELD;
          heldSince.set(r.id, t);
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
        powerUsed(s, h.id) <= totalChargingPower(s, h.id) + 1e-8,
        'SimulationInvariant',
        'Mô phỏng vượt tổng công suất các cổng sạc.',
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
