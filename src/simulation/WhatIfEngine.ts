import {
  ChargingReservation,
  Incident,
  Scenario,
  SimulationResult,
  NetworkSnapshot,
} from '../models/entities.js';
import {
  ChargingSessionStatus,
  HubStatus,
  IncidentStatus,
  PortStatus,
  ReservationKind,
  ReservationStatus,
  Role,
  SpaceStatus,
  VehicleOwnership,
  VehicleStatus,
} from '../models/enums.js';
import type {
  NetworkState,
  SimulationAction,
  SimulationAffected,
  SimulationAllocation,
  SimulationAssessment,
  SimulationHubResource,
  SimulationMetric,
  SimulationProposal,
  SimulationTrial,
  SimulationWaiting,
} from '../models/types.js';
import {
  connected,
  fault,
  freeSpace,
  freeVehicle,
  held,
  restorePort,
  restoreVehicle,
} from '../shared/business.js';
import { chargingPriority } from '../shared/scheduling.js';
import { config, minute } from '../shared/config.js';
import { ensure, must, numeric } from '../shared/errors.js';

type Context = {
  original: NetworkState;
  state: NetworkState;
  scenario: Scenario;
  capturedAt: number;
  simulatedIds: Set<string>;
  inputs: { label: string; value: string }[];
};
const metric = (
  key: string,
  label: string,
  value: number,
  unit: string,
  previous?: number,
): SimulationMetric => ({ key, label, value, unit, previous });

/** Static resource accounting only. It never generates trips, advances time or writes the live repository. */
export class WhatIfEngine {
  constructor(private now = Date.now) {}

  simulate(snapshot: NetworkSnapshot, scenario: Scenario): SimulationResult {
    const context = this.prepare(snapshot, scenario);
    const assessment = this.assess(context);
    const proposals = this.proposals(context, assessment);
    const charging = ['CHARGING_SURGE', 'PORT_FAILURE'].includes(scenario.type);
    return new SimulationResult({
      scenarioId: scenario.id,
      generatedAt: snapshot.capturedAt,
      type: scenario.type,
      targetHubId: scenario.targetHubId,
      targetHubName:
        scenario.type === 'VEHICLE_IMBALANCE'
          ? 'Toàn mạng lưới'
          : must(context.state.hubs, scenario.targetHubId!).name,
      inputs: context.inputs,
      metrics: new Map(assessment.metrics.map((m) => [m.key, m.value])),
      assessment,
      proposals,
      recommendations: proposals.length
        ? []
        : charging
          ? [
              assessment.metrics.find((m) => m.key === 'totalWaiting')?.value
                ? 'Hiện chưa có phương án cấp thêm yêu cầu phù hợp. Giữ hàng chờ theo ưu tiên; không ngắt phiên đang sạc để nhường cổng.'
                : 'Không có yêu cầu chờ cấp cổng trong giả định này.',
            ]
          : [
              assessment.metrics.find((m) => m.key === 'shortage')?.value
                ? 'Chưa có xe đủ điều kiện hoặc chỗ nhận để điều phối. Cần giải phóng tài nguyên rồi tính lại; phần thiếu vẫn được giữ nguyên.'
                : 'Đã đạt mục tiêu giả định; không cần điều chuyển thêm.',
            ],
      assumptions: [
        'Đánh giá tài nguyên tại một thời điểm trên bản sao; không sinh lượt thuê, không có seed hoặc khoảng thời gian dự báo.',
        'Nhu cầu cấp xe là giả định do Operator nhập, tính trên phần xe còn rảnh sau các cam kết hiện có. Một xe chỉ cấp cho một yêu cầu trong đợt giả định.',
        `Điều phối chỉ dùng xe chung đủ điều kiện, giữ ít nhất ${config.whatIfReserveVehicles} xe rảnh tại Hub nguồn; khi cân bằng dùng mức tối thiểu đã nhập nếu cao hơn. Chỗ đã giữ không được sử dụng lại.`,
        'Trạng thái sau điều chuyển là khi đã hoàn tất bàn giao, trước khi cấp xe cho khách. Không dự đoán Hub trả của các chuyến thuê.',
        'Sạc chỉ tính khả năng giữ cổng ngay. Không tăng pin, không dự đoán thời gian chờ hoặc thời điểm hoàn thành.',
        'Khôi phục cổng và rút dây là giả định có điều kiện, cần kỹ thuật viên/chủ xe thực hiện thật. Cổng đang có xe cắm không tự trở thành cổng trống.',
        'Mọi phương án chỉ thử trên bản sao; không tạo lệnh điều phối, phiên sạc, thông báo hoặc thay đổi sự cố trong hệ thống thật.',
      ],
    });
  }

  evaluate(
    snapshot: NetworkSnapshot,
    scenario: Scenario,
    proposal: SimulationProposal,
  ): SimulationTrial {
    const result = this.simulate(snapshot, scenario);
    const known = result.proposals.find((p) => p.id === proposal.id);
    ensure(
      known && JSON.stringify(known.actions) === JSON.stringify(proposal.actions),
      'InvalidSimulationPlan',
      'Phương án không thuộc phân tích đã lưu.',
      400,
    );
    const context = this.prepare(snapshot, scenario);
    for (const action of known.actions) this.apply(context, action);
    this.validateState(context);
    return {
      scenarioId: scenario.id,
      proposalId: known.id,
      evaluatedAt: this.now(),
      proposal: known,
      before: result.assessment,
      after: this.assess(context, known.actions),
    };
  }

  private number(
    scenario: Scenario,
    key: string,
    min: number = 0,
    max: number = config.whatIfMaxInput,
    integer = true,
  ): number {
    const value = scenario.parameters.get(key);
    numeric(value, key, min, max);
    ensure(
      !integer || Number.isInteger(value),
      'InvalidScenario',
      `${key} phải là số nguyên.`,
      400,
    );
    return value as number;
  }

  private prepare(snapshot: NetworkSnapshot, scenario: Scenario): Context {
    ensure(
      ['DEMAND_SURGE', 'HUB_FULL', 'VEHICLE_IMBALANCE', 'CHARGING_SURGE', 'PORT_FAILURE'].includes(
        scenario.type,
      ),
      'InvalidScenario',
      'Loại tình huống không hợp lệ.',
      400,
    );
    ensure(
      scenario.parameters instanceof Map,
      'InvalidScenario',
      'Tham số phải là một tập giá trị hợp lệ.',
      400,
    );
    const original = structuredClone(snapshot.state);
    const state = structuredClone(original);
    const context: Context = {
      original,
      state,
      scenario,
      capturedAt: snapshot.capturedAt,
      simulatedIds: new Set(),
      inputs: [],
    };
    const p = scenario.parameters;
    let allowed: string[];
    if (scenario.type === 'VEHICLE_IMBALANCE') {
      allowed = ['minimumVehicles'];
      ensure(
        [...state.hubs.values()].some((h) => h.status === HubStatus.ACTIVE),
        'InvalidScenario',
        'Chưa có Hub đang hoạt động.',
        400,
      );
      context.inputs.push({
        label: 'Mức xe tối thiểu mỗi Hub',
        value: `${this.number(scenario, 'minimumVehicles', 1)} xe`,
      });
    } else {
      ensure(
        typeof scenario.targetHubId === 'string',
        'InvalidScenario',
        'Chọn Hub cần phân tích.',
        400,
      );
      const hub = must(state.hubs, scenario.targetHubId, 'Hub');
      ensure(hub.status === HubStatus.ACTIVE, 'InvalidScenario', 'Chọn Hub đang hoạt động.', 400);
      if (scenario.type === 'DEMAND_SURGE') {
        if (p.has('requiredVehicles')) {
          allowed = ['requiredVehicles'];
          context.inputs.push({
            label: 'Số xe cần có tại Hub',
            value: `${this.number(scenario, 'requiredVehicles', 1)} xe (giả định nhập trực tiếp)`,
          });
        } else {
          allowed = ['baselineDemand', 'multiplier'];
          const baseline = this.number(scenario, 'baselineDemand', 1);
          const multiplier = this.number(scenario, 'multiplier', 1, 3, false);
          context.inputs.push(
            { label: 'Nhu cầu nền do Operator nhập', value: `${baseline} xe` },
            {
              label: 'Nhu cầu giả định',
              value: `Làm tròn lên ${baseline} × ${multiplier} = ${Math.ceil(baseline * multiplier)} xe`,
            },
          );
        }
      } else if (scenario.type === 'HUB_FULL') {
        allowed = ['requiredFreeSpaces'];
        const total = [...state.spaces.values()].filter((space) => space.hubId === hub.id).length;
        context.inputs.push({
          label: 'Số chỗ trống muốn đạt',
          value: `${this.number(scenario, 'requiredFreeSpaces', 0, total)} chỗ`,
        });
      } else if (scenario.type === 'CHARGING_SURGE') {
        allowed = ['newRequests'];
        const count = this.number(scenario, 'newRequests');
        const eligible = this.eligibleChargingVehicles(context);
        ensure(
          count <= eligible.length,
          'InvalidScenario',
          `Hub chỉ có ${eligible.length} xe đang đỗ đủ điều kiện để giả định thêm yêu cầu sạc mục tiêu ${config.whatIfChargeTarget}%.`,
          400,
        );
        for (const vehicle of eligible.slice(0, count)) {
          const requestId = `whatif:${scenario.id}:${vehicle.id}`;
          const request = new ChargingReservation({
            id: requestId,
            kind: ReservationKind.CHARGING,
            hubId: hub.id,
            vehicleId: vehicle.id,
            userId: vehicle.ownerId ?? scenario.creatorId,
            status: ReservationStatus.WAITING,
            createdAt: snapshot.capturedAt,
            expiresAt: snapshot.capturedAt + config.waitingMinutes * minute,
            extensionCount: 0,
            targetBattery: config.whatIfChargeTarget,
          });
          state.reservations.set(requestId, request);
          context.simulatedIds.add(requestId);
        }
        context.inputs.push(
          {
            label: 'Giả định thêm',
            value: `${count} yêu cầu từ xe thực có tại Hub, chọn pin thấp trước`,
          },
          { label: 'Pin mục tiêu cho yêu cầu mới', value: `${config.whatIfChargeTarget}%` },
        );
      } else {
        allowed = ['portId'];
        const portId = p.get('portId');
        ensure(
          typeof portId === 'string' && portId.length > 0,
          'InvalidScenario',
          'Chọn cổng cần giả định lỗi.',
          400,
        );
        const port = must(state.ports, portId, 'Cổng sạc');
        ensure(port.hubId === hub.id, 'InvalidScenario', 'Cổng không thuộc Hub đã chọn.', 400);
        const alreadyFaulty =
          port.status === PortStatus.FAULT || fault(state, 'CHARGING_PORT', port.id);
        context.inputs.push({
          label: 'Cổng được phân tích',
          value: `${port.id}${alreadyFaulty ? ' (đã lỗi trong dữ liệu hiện tại)' : ' (giả định bị lỗi)'}`,
        });
        if (!fault(state, 'CHARGING_PORT', port.id)) {
          const incident = new Incident({
            id: `whatif-fault:${scenario.id}`,
            reporterId: scenario.creatorId,
            target: { kind: 'CHARGING_PORT', id: port.id },
            description: 'Giả định cổng lỗi trên bản sao What-if',
            status: IncidentStatus.OPEN,
            createdAt: snapshot.capturedAt,
          });
          state.incidents.set(incident.id, incident);
        }
        port.status = PortStatus.FAULT;
      }
    }
    ensure(
      [...p.keys()].every((key) => allowed.includes(key)),
      'InvalidScenario',
      'Tham số không thuộc tình huống hoặc có hai cách nhập nhu cầu cùng lúc.',
      400,
    );
    return context;
  }

  private reserve(scenario: Scenario): number {
    return scenario.type === 'VEHICLE_IMBALANCE'
      ? Math.max(config.whatIfReserveVehicles, this.number(scenario, 'minimumVehicles', 1))
      : config.whatIfReserveVehicles;
  }
  private available(s: NetworkState, hubId: string) {
    return [...s.vehicles.values()].filter((v) => v.currentHubId === hubId && freeVehicle(s, v));
  }
  private spaces(s: NetworkState, hubId: string) {
    return [...s.spaces.values()].filter((p) => p.hubId === hubId && freeSpace(s, p));
  }
  private freePorts(s: NetworkState, hubId: string) {
    return [...s.ports.values()].filter(
      (p) => p.hubId === hubId && p.status === PortStatus.FREE && !fault(s, 'CHARGING_PORT', p.id),
    );
  }
  private queue(s: NetworkState, hubId: string, at: number): ChargingReservation[] {
    return [...s.reservations.values()]
      .filter(
        (r): r is ChargingReservation =>
          r.kind === ReservationKind.CHARGING &&
          r.hubId === hubId &&
          r.status === ReservationStatus.WAITING &&
          r.expiresAt > at,
      )
      .sort((a, b) => chargingPriority(a, b, s.vehicles));
  }
  private chargingReason(s: NetworkState, request: ChargingReservation): string | undefined {
    const v = s.vehicles.get(request.vehicleId);
    if (
      !v ||
      v.currentHubId !== request.hubId ||
      !v.parkingSpaceId ||
      v.status !== VehicleStatus.AVAILABLE ||
      connected(s, v.id) ||
      fault(s, 'VEHICLE', v.id)
    )
      return 'Xe chưa đủ điều kiện sạc tại Hub.';
    if (
      v.ownership === VehicleOwnership.PERSONAL &&
      (!v.ownerId || !s.users.has(v.ownerId) || s.users.get(v.ownerId)!.restricted)
    )
      return 'Chủ xe hiện chưa đủ điều kiện sử dụng dịch vụ.';
    if (v.batteryLevel >= request.targetBattery) return 'Pin đã đạt mục tiêu của yêu cầu.';
    return undefined;
  }
  private eligibleChargingVehicles(context: Context) {
    const { state: s, scenario } = context;
    return [...s.vehicles.values()]
      .filter(
        (v) =>
          v.currentHubId === scenario.targetHubId &&
          v.parkingSpaceId &&
          v.status === VehicleStatus.AVAILABLE &&
          v.batteryLevel < config.whatIfChargeTarget &&
          !fault(s, 'VEHICLE', v.id) &&
          !connected(s, v.id) &&
          ![...s.reservations.values()].some((r) => r.vehicleId === v.id && held(r)) &&
          (v.ownership === VehicleOwnership.SHARED ||
            (!!v.ownerId &&
              s.users.get(v.ownerId)?.role === Role.CUSTOMER &&
              !s.users.get(v.ownerId)?.restricted)),
      )
      .sort((a, b) => a.batteryLevel - b.batteryLevel || a.id.localeCompare(b.id));
  }
  private resources(s: NetworkState, context: Context): SimulationHubResource[] {
    return [...s.hubs.values()].map((h) => {
      const active = h.status === HubStatus.ACTIVE;
      const availableVehicles = active ? this.available(s, h.id).length : 0;
      const ports = [...s.ports.values()].filter((p) => p.hubId === h.id);
      return {
        hubId: h.id,
        hubName: h.name,
        status: h.status,
        availableVehicles,
        donatableVehicles: Math.max(0, availableVehicles - this.reserve(context.scenario)),
        freeSpaces: active ? this.spaces(s, h.id).length : 0,
        totalSpaces: [...s.spaces.values()].filter((p) => p.hubId === h.id).length,
        usablePorts: active
          ? ports.filter((p) => p.status !== PortStatus.FAULT && !fault(s, 'CHARGING_PORT', p.id))
              .length
          : 0,
        freePorts: active ? this.freePorts(s, h.id).length : 0,
        waitingCharges: this.queue(s, h.id, context.capturedAt).length,
      };
    });
  }
  private allocations(context: Context): {
    allocations: SimulationAllocation[];
    waiting: SimulationWaiting[];
  } {
    const { state: s, scenario } = context;
    const ports = this.freePorts(s, scenario.targetHubId!);
    const allocatedVehicles = new Set<string>();
    const allocations: SimulationAllocation[] = [];
    const waiting: SimulationWaiting[] = [];
    for (const request of this.queue(s, scenario.targetHubId!, context.capturedAt)) {
      const reason =
        this.chargingReason(s, request) ||
        (allocatedVehicles.has(request.vehicleId)
          ? 'Xe đã có một yêu cầu được cấp cổng.'
          : undefined);
      const port = reason
        ? undefined
        : ports.find((p) => !request.preferredPortId || p.id === request.preferredPortId);
      const item = {
        requestId: request.id,
        vehicleId: request.vehicleId,
        vehicleCode: s.vehicles.get(request.vehicleId)?.code ?? request.vehicleId,
        simulated: context.simulatedIds.has(request.id),
      };
      if (port) {
        allocations.push({ ...item, portId: port.id });
        ports.splice(ports.indexOf(port), 1);
        allocatedVehicles.add(request.vehicleId);
      } else
        waiting.push({
          ...item,
          reason:
            reason ??
            (request.preferredPortId
              ? `Cổng ưu tiên ${request.preferredPortId} chưa trống hoặc đang lỗi.`
              : 'Chưa có cổng trống phù hợp.'),
        });
    }
    return { allocations, waiting };
  }
  private affected(context: Context): SimulationAffected[] {
    if (context.scenario.type !== 'PORT_FAILURE') return [];
    const s = context.state;
    const port = must(s.ports, String(context.scenario.parameters.get('portId')));
    const broken = port.status === PortStatus.FAULT || fault(s, 'CHARGING_PORT', port.id);
    const result: SimulationAffected[] = [];
    for (const c of s.chargingSessions.values())
      if (
        c.portId === port.id &&
        [ChargingSessionStatus.ACTIVE, ChargingSessionStatus.AWAITING_DISCONNECT].includes(
          c.status,
        ) &&
        (broken || fault(s, 'VEHICLE', c.vehicleId))
      ) {
        result.push({
          vehicleId: c.vehicleId,
          vehicleCode: must(s.vehicles, c.vehicleId).code,
          portId: port.id,
          status: c.status,
          reason: fault(s, 'VEHICLE', c.vehicleId)
            ? 'Xe còn sự cố riêng cần kiểm tra.'
            : c.status === ChargingSessionStatus.ACTIVE
              ? 'Phiên đang sạc bị tạm dừng do cổng lỗi.'
              : 'Xe đã dừng sạc nhưng vẫn cắm tại cổng lỗi.',
        });
      }
    for (const r of s.reservations.values())
      if (
        r.kind === ReservationKind.CHARGING &&
        r.portId === port.id &&
        r.status === ReservationStatus.HELD &&
        broken
      )
        result.push({
          vehicleId: r.vehicleId,
          vehicleCode: must(s.vehicles, r.vehicleId).code,
          portId: port.id,
          status: 'HELD',
          reason: 'Đã giữ cổng nhưng chưa thể bắt đầu vì cổng lỗi.',
        });
    return result;
  }

  private assess(context: Context, applied: SimulationAction[] = []): SimulationAssessment {
    const { state: s, scenario } = context;
    const hubs = this.resources(s, context);
    const active = hubs.filter((h) => h.status === HubStatus.ACTIVE);
    const target = hubs.find((h) => h.hubId === scenario.targetHubId);
    const notes: string[] = [];
    const empty = { hubs, allocations: [], waiting: [], affected: [] };
    if (scenario.type === 'VEHICLE_IMBALANCE') {
      const minimum = this.number(scenario, 'minimumVehicles', 1);
      const below = active.filter((h) => h.availableVehicles < minimum);
      const missing = below.reduce((sum, h) => sum + minimum - h.availableVehicles, 0);
      for (const h of below)
        if (!h.freeSpaces) notes.push(`${h.hubName} chưa có chỗ trống để nhận thêm xe.`);
      return {
        ...empty,
        summary: below.length
          ? `${below.length} Hub dưới mức ${minimum} xe; cần bổ sung tổng cộng ${missing} xe.`
          : `Các Hub đang hoạt động đều đạt mức tối thiểu ${minimum} xe.`,
        metrics: [
          metric('minimumVehicles', 'Mức xe tối thiểu mỗi Hub', minimum, 'xe'),
          metric('hubsBelowMinimum', 'Hub chưa đạt mức tối thiểu', below.length, 'Hub'),
          metric('shortage', 'Tổng xe cần bổ sung', missing, 'xe'),
          metric(
            'networkAvailableVehicles',
            'Xe khả dụng toàn mạng lưới',
            active.reduce((sum, h) => sum + h.availableVehicles, 0),
            'xe',
          ),
        ],
        calculations: below.length
          ? below.map(
              (h) =>
                `${h.hubName}: cần bổ sung ${minimum} − ${h.availableVehicles} = ${minimum - h.availableVehicles} xe.`,
            )
          : ['Không có Hub thiếu xe theo mức tối thiểu đã nhập.'],
        notes,
      };
    }
    if (scenario.type === 'DEMAND_SURGE') {
      const required = scenario.parameters.has('requiredVehicles')
        ? this.number(scenario, 'requiredVehicles', 1)
        : Math.ceil(
            this.number(scenario, 'baselineDemand', 1) *
              this.number(scenario, 'multiplier', 1, 3, false),
          );
      const shortage = Math.max(0, required - target!.availableVehicles);
      const sourceTotal = active
        .filter((h) => h.hubId !== target!.hubId)
        .reduce((sum, h) => sum + h.donatableVehicles, 0);
      if (shortage > target!.freeSpaces)
        notes.push(
          `Hub chỉ còn ${target!.freeSpaces} chỗ nhận; không thể đưa thêm ${shortage} xe cùng lúc.`,
        );
      if (sourceTotal < shortage)
        notes.push(`Các Hub khác chỉ có thể cho đi ${sourceTotal} xe sau khi giữ dự phòng.`);
      return {
        ...empty,
        summary: shortage
          ? `${target!.hubName} thiếu ${shortage} xe để đạt mức ${required} xe.`
          : `${target!.hubName} đã đủ ${required} xe theo nhu cầu giả định.`,
        metrics: [
          metric('requiredVehicles', 'Hub cần có', required, 'xe'),
          metric('availableVehicles', 'Hub hiện có khả dụng', target!.availableVehicles, 'xe'),
          metric('shortage', 'Cần bổ sung', shortage, 'xe'),
          metric('freeSpaces', 'Chỗ trống có thể nhận xe', target!.freeSpaces, 'chỗ'),
        ],
        calculations: [
          `Cần bổ sung = max(0, ${required} − ${target!.availableVehicles}) = ${shortage} xe.`,
          `Nguồn khác có thể cho đi tổng cộng ${sourceTotal} xe, sau khi giữ ${this.reserve(scenario)} xe rảnh ở mỗi Hub.`,
        ],
        notes,
      };
    }
    if (scenario.type === 'HUB_FULL') {
      const required = this.number(scenario, 'requiredFreeSpaces', 0, target!.totalSpaces);
      const shortage = Math.max(0, required - target!.freeSpaces);
      const receiving = active
        .filter((h) => h.hubId !== target!.hubId)
        .reduce((sum, h) => sum + h.freeSpaces, 0);
      if (shortage > target!.donatableVehicles)
        notes.push(
          `Chỉ có thể chuyển tối đa ${target!.donatableVehicles} xe chung rảnh sau khi giữ dự phòng; không tự di chuyển xe cá nhân hoặc hủy chỗ đã giữ.`,
        );
      if (shortage > receiving) notes.push(`Các Hub khác chỉ còn ${receiving} chỗ nhận.`);
      return {
        ...empty,
        summary: shortage
          ? `Cần giải phóng thêm ${shortage} chỗ tại ${target!.hubName}.`
          : `${target!.hubName} đã có đủ ${required} chỗ trống.`,
        metrics: [
          metric('requiredFreeSpaces', 'Số chỗ trống muốn đạt', required, 'chỗ'),
          metric('freeSpaces', 'Chỗ trống hiện có', target!.freeSpaces, 'chỗ'),
          metric('shortage', 'Chỗ cần giải phóng thêm', shortage, 'chỗ'),
          metric('movableVehicles', 'Xe chung có thể chuyển đi', target!.donatableVehicles, 'xe'),
        ],
        calculations: [
          `Cần giải phóng = max(0, ${required} − ${target!.freeSpaces}) = ${shortage} chỗ.`,
          'Chuyển một xe đang đỗ đủ điều kiện sẽ giải phóng một chỗ; chỗ đã giữ cho cam kết khác vẫn được bảo vệ.',
        ],
        notes,
      };
    }
    const { allocations, waiting } = this.allocations(context);
    const originalWaiting = this.queue(context.original, target!.hubId, context.capturedAt).length;
    const added = context.simulatedIds.size;
    const currentWaiting = this.queue(s, target!.hubId, context.capturedAt).length;
    const assigned = applied.filter((a) => a.type === 'ALLOCATE').length;
    const affected = this.affected(context);
    const interrupted = affected.filter((a) => a.status === ChargingSessionStatus.ACTIVE).length;
    const original = this.resources(context.original, context).find(
      (h) => h.hubId === target!.hubId,
    )!;
    const metrics =
      scenario.type === 'CHARGING_SURGE'
        ? [
            metric('existingWaiting', 'Yêu cầu chờ ban đầu', originalWaiting, 'yêu cầu'),
            metric('newRequests', 'Giả định thêm', added, 'yêu cầu'),
            metric('totalWaiting', 'Đang chờ cấp cổng', currentWaiting, 'yêu cầu'),
            metric('freePorts', 'Cổng khỏe đang trống', target!.freePorts, 'cổng'),
            metric('usablePorts', 'Cổng còn sử dụng được', target!.usablePorts, 'cổng'),
            metric('canAllocate', 'Có thể cấp ngay', allocations.length, 'yêu cầu'),
            metric('remainingWaiting', 'Còn chờ nếu cấp cổng trống', waiting.length, 'yêu cầu'),
          ]
        : [
            metric(
              'usablePorts',
              'Cổng còn sử dụng được',
              target!.usablePorts,
              'cổng',
              original.usablePorts,
            ),
            metric(
              'freePorts',
              'Cổng khỏe đang trống',
              target!.freePorts,
              'cổng',
              original.freePorts,
            ),
            metric('affectedSessions', 'Phiên đang sạc bị ảnh hưởng', interrupted, 'phiên'),
            metric(
              'affectedHolds',
              'Yêu cầu đã giữ cổng bị ảnh hưởng',
              affected.filter((a) => a.status === 'HELD').length,
              'yêu cầu',
            ),
            metric('totalWaiting', 'Đang chờ cấp cổng', currentWaiting, 'yêu cầu'),
            metric('canAllocate', 'Có thể cấp ngay', allocations.length, 'yêu cầu'),
          ];
    metrics.push(
      metric('assignedByPlan', 'Yêu cầu được giữ cổng theo phương án', assigned, 'yêu cầu'),
    );
    let summary = currentWaiting
      ? `${allocations.length}/${currentWaiting} yêu cầu có thể được cấp cổng ngay; ${waiting.length} yêu cầu tiếp tục chờ.`
      : 'Không có yêu cầu chờ cấp cổng tại Hub trong giả định này.';
    if (assigned)
      summary = `Đã giả định giữ ${assigned} cổng cho ${assigned} yêu cầu; còn ${currentWaiting} yêu cầu chờ cấp cổng.`;
    if (scenario.type === 'PORT_FAILURE') {
      const selected = must(s.ports, String(scenario.parameters.get('portId')));
      const broken = selected.status === PortStatus.FAULT || fault(s, 'CHARGING_PORT', selected.id);
      summary = broken
        ? `Cổng ${selected.id} bị lỗi; ${interrupted} phiên đang sạc bị ảnh hưởng.`
        : `Cổng ${selected.id} đã được khôi phục trong giả định; ${interrupted} phiên còn bị ảnh hưởng.`;
      if (!broken && selected.status !== PortStatus.FREE && selected.status !== PortStatus.HELD)
        notes.push(
          'Cổng được khôi phục vẫn đang có xe cắm; không tính thành cổng trống để cấp cho xe khác.',
        );
    }
    if (waiting.length)
      notes.push(
        'Ưu tiên hạn cần xe sớm, pin thấp, rồi yêu cầu đến trước. Đổi thứ tự không tự tạo thêm cổng.',
      );
    return {
      summary,
      metrics,
      hubs,
      allocations,
      waiting,
      affected,
      calculations: [
        `Yêu cầu chờ = ${originalWaiting} ban đầu + ${added} giả định thêm − ${assigned} đã giữ theo phương án = ${currentWaiting}.`,
        `${target!.freePorts} cổng khỏe trống; ghép được ${allocations.length} yêu cầu phù hợp, còn ${waiting.length} yêu cầu chưa ghép được.`,
      ],
      notes,
    };
  }

  private proposals(context: Context, assessment: SimulationAssessment): SimulationProposal[] {
    const { scenario } = context;
    if (!['CHARGING_SURGE', 'PORT_FAILURE'].includes(scenario.type)) {
      const planning: Context = { ...context, state: structuredClone(context.state) };
      const actions: SimulationAction[] = [];
      const floor = this.reserve(scenario);
      const move = (from: string, to: string, requested: number) => {
        const vehicles = this.available(planning.state, from);
        const quantity = Math.min(
          requested,
          Math.max(0, vehicles.length - floor),
          this.spaces(planning.state, to).length,
          50,
        );
        if (quantity <= 0) return false;
        const action: SimulationAction = {
          type: 'RELOCATE',
          fromHubId: from,
          toHubId: to,
          vehicleIds: vehicles.slice(0, quantity).map((v) => v.id),
          quantity,
        };
        this.apply(planning, action);
        actions.push(action);
        return true;
      };
      if (scenario.type === 'VEHICLE_IMBALANCE') {
        const minimum = this.number(scenario, 'minimumVehicles', 1);
        const targets = this.resources(planning.state, planning)
          .filter((h) => h.status === HubStatus.ACTIVE)
          .sort(
            (a, b) => a.availableVehicles - b.availableVehicles || a.hubId.localeCompare(b.hubId),
          );
        for (const target of targets) {
          while (this.available(planning.state, target.hubId).length < minimum) {
            const donor = this.resources(planning.state, planning)
              .filter(
                (h) =>
                  h.status === HubStatus.ACTIVE &&
                  h.hubId !== target.hubId &&
                  h.donatableVehicles > 0,
              )
              .sort(
                (a, b) =>
                  b.donatableVehicles - a.donatableVehicles || a.hubId.localeCompare(b.hubId),
              )[0];
            if (
              !donor ||
              !move(
                donor.hubId,
                target.hubId,
                minimum - this.available(planning.state, target.hubId).length,
              )
            )
              break;
          }
        }
      } else {
        let shortage = assessment.metrics.find((m) => m.key === 'shortage')!.value;
        const incoming = scenario.type === 'DEMAND_SURGE';
        while (shortage > 0) {
          const others = this.resources(planning.state, planning)
            .filter(
              (h) =>
                h.status === HubStatus.ACTIVE &&
                h.hubId !== scenario.targetHubId &&
                (incoming ? h.donatableVehicles > 0 : h.freeSpaces > 0),
            )
            .sort(
              (a, b) =>
                (incoming
                  ? b.donatableVehicles - a.donatableVehicles
                  : b.freeSpaces - a.freeSpaces) || a.hubId.localeCompare(b.hubId),
            );
          if (!others.length) break;
          const before = actions.length;
          if (
            !move(
              incoming ? others[0].hubId : scenario.targetHubId!,
              incoming ? scenario.targetHubId! : others[0].hubId,
              shortage,
            )
          )
            break;
          shortage -= (actions[before] as Extract<SimulationAction, { type: 'RELOCATE' }>).quantity;
        }
      }
      this.validateState(planning);
      return actions.length
        ? [
            {
              id: 'relocate',
              title: 'Điều phối theo nguồn lực hiện có',
              description:
                'Chọn nguồn còn nhiều xe có thể cho đi nhất; khi giải phóng chỗ thì chọn nơi còn nhiều chỗ nhận nhất.',
              actions,
              assumptions: [
                'Kết quả sau điều phối tính khi đã hoàn tất bàn giao, trước khi cấp xe cho khách.',
                `Giữ ít nhất ${floor} xe rảnh tại mỗi Hub nguồn; không dùng lại chỗ đã giữ hoặc xe đang bận.`,
              ],
            },
          ]
        : [];
    }
    const result: SimulationProposal[] = [];
    const allocateActions = (allocations: SimulationAllocation[]): SimulationAction[] =>
      allocations.map((a) => ({
        type: 'ALLOCATE',
        hubId: scenario.targetHubId!,
        requestId: a.requestId,
        vehicleId: a.vehicleId,
        portId: a.portId,
      }));
    const allocation: SimulationProposal | undefined = assessment.allocations.length
      ? {
          id: 'allocate',
          title: 'Cấp cổng theo thứ tự ưu tiên',
          description:
            'Giữ từng cổng trống phù hợp cho một yêu cầu. Các yêu cầu còn lại tiếp tục chờ.',
          actions: allocateActions(assessment.allocations),
          assumptions: [
            'Chỉ giả định giữ cổng; chủ xe hoặc kỹ thuật viên đội xe vẫn cần bắt đầu phiên sạc.',
          ],
        }
      : undefined;
    if (allocation && scenario.type === 'CHARGING_SURGE') result.push(allocation);
    const ports = [...context.state.ports.values()]
      .filter(
        (p) =>
          p.hubId === scenario.targetHubId &&
          (p.status === PortStatus.FAULT || fault(context.state, 'CHARGING_PORT', p.id)),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const repairPorts =
      scenario.type === 'PORT_FAILURE'
        ? ports.filter((p) => p.id === scenario.parameters.get('portId'))
        : assessment.waiting.length
          ? ports
          : [];
    for (const port of repairPorts) {
      const action: SimulationAction = { type: 'RECOVER_PORT', hubId: port.hubId, portId: port.id };
      const repaired: Context = { ...context, state: structuredClone(context.state) };
      this.apply(repaired, action);
      result.push({
        id: `recover:${port.id}`,
        title: `Giả định khôi phục cổng ${port.id}`,
        description:
          'Kỹ thuật viên xác nhận đã sửa xong cổng; tính lại khả năng cấp cổng và phiên bị ảnh hưởng.',
        actions: [action, ...allocateActions(this.allocations(repaired).allocations)],
        assumptions: [
          'Chỉ là giả định cổng đã sửa xong, không tự đóng sự cố thật.',
          'Cổng còn xe đang sạc hoặc đang cắm không trở thành cổng trống.',
        ],
      });
    }
    if (allocation && scenario.type === 'PORT_FAILURE') result.push(allocation);
    for (const c of context.state.chargingSessions.values())
      if (
        c.status === ChargingSessionStatus.AWAITING_DISCONNECT &&
        context.state.ports.get(c.portId)?.hubId === scenario.targetHubId &&
        !fault(context.state, 'CHARGING_PORT', c.portId) &&
        context.state.ports.get(c.portId)?.status !== PortStatus.FAULT &&
        assessment.waiting.length
      ) {
        const action: SimulationAction = {
          type: 'DISCONNECT',
          hubId: scenario.targetHubId!,
          portId: c.portId,
          sessionId: c.id,
          vehicleId: c.vehicleId,
        };
        const released: Context = { ...context, state: structuredClone(context.state) };
        this.apply(released, action);
        result.push({
          id: `disconnect:${c.id}`,
          title: `Giả định rút dây cổng ${c.portId}`,
          description:
            'Phiên đã ngừng cấp điện. Chủ xe hoặc kỹ thuật viên đội xe hoàn tất ngắt kết nối để giải phóng cổng.',
          actions: [action, ...allocateActions(this.allocations(released).allocations)],
          assumptions: [
            'Chỉ áp dụng cho phiên đã dừng, đang chờ rút dây; không ngắt một phiên đang sạc.',
          ],
        });
      }
    return result;
  }

  private apply(context: Context, action: SimulationAction): void {
    const s = context.state;
    if (action.type === 'RELOCATE') {
      ensure(
        action.fromHubId !== action.toHubId &&
          s.hubs.get(action.fromHubId)?.status === HubStatus.ACTIVE &&
          s.hubs.get(action.toHubId)?.status === HubStatus.ACTIVE,
        'InvalidSimulationPlan',
        'Hub điều chuyển không hợp lệ.',
        400,
      );
      const available = this.available(s, action.fromHubId);
      const spaces = this.spaces(s, action.toHubId);
      ensure(
        action.quantity > 0 &&
          action.quantity <= 50 &&
          action.vehicleIds.length === action.quantity &&
          new Set(action.vehicleIds).size === action.quantity &&
          action.quantity <= available.length - this.reserve(context.scenario) &&
          action.quantity <= spaces.length &&
          action.vehicleIds.every((id) => available.some((v) => v.id === id)),
        'InvalidSimulationPlan',
        'Lệnh vượt xe có thể cho đi hoặc chỗ nhận.',
        409,
      );
      action.vehicleIds.forEach((id, index) => {
        const v = must(s.vehicles, id);
        const old = must(s.spaces, v.parkingSpaceId!);
        const next = spaces[index];
        ensure(old.vehicleId === v.id, 'SimulationInvariant', 'Xe không khớp chỗ đỗ nguồn.');
        old.vehicleId = undefined;
        old.status = SpaceStatus.FREE;
        next.vehicleId = v.id;
        next.status = SpaceStatus.OCCUPIED;
        v.currentHubId = action.toHubId;
        v.parkingSpaceId = next.id;
      });
    } else if (action.type === 'RECOVER_PORT') {
      const port = must(s.ports, action.portId);
      ensure(
        port.hubId === action.hubId &&
          (port.status === PortStatus.FAULT || fault(s, 'CHARGING_PORT', port.id)),
        'InvalidSimulationPlan',
        'Cổng chưa ở trạng thái cần khôi phục.',
        409,
      );
      for (const incident of s.incidents.values())
        if (incident.target.kind === 'CHARGING_PORT' && incident.target.id === port.id)
          incident.status = IncidentStatus.RESOLVED;
      port.status = PortStatus.FREE;
      restorePort(s, port.id);
    } else if (action.type === 'DISCONNECT') {
      const c = must(s.chargingSessions, action.sessionId);
      const port = must(s.ports, action.portId);
      ensure(
        c.vehicleId === action.vehicleId &&
          c.portId === port.id &&
          port.hubId === action.hubId &&
          c.status === ChargingSessionStatus.AWAITING_DISCONNECT &&
          port.status !== PortStatus.FAULT &&
          !fault(s, 'CHARGING_PORT', port.id),
        'InvalidSimulationPlan',
        'Chỉ được rút dây ở cổng khỏe của phiên đã dừng.',
        409,
      );
      c.status =
        c.stopReason === 'MANUAL'
          ? ChargingSessionStatus.CANCELLED
          : ChargingSessionStatus.COMPLETED;
      c.endedAt = context.capturedAt;
      must(s.reservations, c.reservationId).status = ReservationStatus.COMPLETED;
      restorePort(s, c.portId);
      restoreVehicle(s, must(s.vehicles, c.vehicleId));
    } else {
      const request = must(s.reservations, action.requestId);
      const port = must(s.ports, action.portId);
      ensure(
        request.kind === ReservationKind.CHARGING &&
          request.status === ReservationStatus.WAITING &&
          request.expiresAt > context.capturedAt &&
          request.vehicleId === action.vehicleId &&
          request.hubId === action.hubId &&
          port.hubId === action.hubId &&
          port.status === PortStatus.FREE &&
          !fault(s, 'CHARGING_PORT', port.id) &&
          (!request.preferredPortId || request.preferredPortId === port.id) &&
          !this.chargingReason(s, request),
        'InvalidSimulationPlan',
        'Yêu cầu hoặc cổng chưa đủ điều kiện để cấp.',
        409,
      );
      request.portId = port.id;
      request.status = ReservationStatus.HELD;
      request.expiresAt = context.capturedAt + config.holdMinutes * minute;
      port.status = PortStatus.HELD;
    }
  }

  private validateState(context: Context): void {
    const s = context.state;
    ensure(
      s.vehicles.size === context.original.vehicles.size &&
        s.spaces.size === context.original.spaces.size &&
        s.ports.size === context.original.ports.size,
      'SimulationInvariant',
      'Không được tạo hoặc xóa tài nguyên vật lý.',
    );
    const seen = new Set<string>();
    for (const p of s.spaces.values())
      if (p.vehicleId) {
        const v = must(s.vehicles, p.vehicleId);
        ensure(
          !seen.has(v.id) &&
            p.status === SpaceStatus.OCCUPIED &&
            v.currentHubId === p.hubId &&
            v.parkingSpaceId === p.id,
          'SimulationInvariant',
          'Xe/chỗ đỗ bị trùng hoặc không khớp.',
        );
        seen.add(v.id);
      }
    for (const key of ['returnSpaceHolds', 'dispatchSpaceHolds'] as const)
      ensure(
        JSON.stringify([...s[key]]) === JSON.stringify([...context.original[key]]),
        'SimulationInvariant',
        'Không được thay đổi chỗ đã cam kết.',
      );
    for (const p of s.spaces.values())
      if (s.returnSpaceHolds.has(p.id) || s.dispatchSpaceHolds.has(p.id))
        ensure(
          !p.vehicleId && p.status === SpaceStatus.HELD,
          'SimulationInvariant',
          'Đã dùng nhầm chỗ giữ cho cam kết khác.',
        );
    for (const v of s.vehicles.values())
      if (v.parkingSpaceId)
        ensure(
          s.spaces.get(v.parkingSpaceId)?.vehicleId === v.id,
          'SimulationInvariant',
          'Xe đang đỗ phải có chỗ tương ứng.',
        );
  }
}
