import { Scenario, SimulationResult, NetworkSnapshot } from '../models/entities.js';
import { Role, ScenarioType } from '../models/enums.js';
import type { ScenarioDTO, SimulationAction, SimulationTrial } from '../models/types.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import { WhatIfEngine } from '../simulation/WhatIfEngine.js';
import { config, minute } from '../shared/config.js';
import { actor } from '../shared/business.js';
import { numeric, ensure, must } from '../shared/errors.js';
import { id } from '../shared/security.js';
export class WhatIfService {
  private analyses = new Map<
    string,
    {
      operatorId: string;
      snapshot: NetworkSnapshot;
      scenario: Scenario;
      action?: SimulationAction;
      expiresAt: number;
    }
  >();
  constructor(
    private repo: InMemoryRepository,
    private engine: WhatIfEngine,
    private now = Date.now,
  ) {}
  run(operatorId: string, data: ScenarioDTO): SimulationResult {
    const snapshot = this.repo.snapshot();
    actor(snapshot.state, operatorId, [Role.OPERATOR]);
    must(snapshot.state.hubs, data.targetHubId, 'Hub');
    ensure(
      Object.values(ScenarioType).includes(data.type),
      'InvalidScenario',
      'Loại kịch bản không hợp lệ.',
      400,
    );
    numeric(data.horizonMinutes, 'Thời gian dự báo', 1, config.maxScenarioMinutes);
    ensure(
      [30, 60, 120].includes(data.horizonMinutes),
      'InvalidScenario',
      'Chọn khoảng khảo sát 30, 60 hoặc 120 phút.',
      400,
    );
    numeric(data.seed, 'Seed', 0, 4294967295);
    ensure(Number.isInteger(data.seed), 'InvalidScenario', 'Seed phải là số nguyên.', 400);
    ensure(
      data.parameters && typeof data.parameters === 'object' && !Array.isArray(data.parameters),
      'InvalidScenario',
      'Tham số kịch bản không hợp lệ.',
      400,
    );
    const allowed: string[] = {
      [ScenarioType.DEMAND_SURGE]: ['multiplier'],
      [ScenarioType.HUB_FULL]: [],
      [ScenarioType.CHARGING_SURGE]: ['multiplier'],
      [ScenarioType.PORT_FAILURE]: ['failedPorts'],
      [ScenarioType.VEHICLE_IMBALANCE]: ['additionalVehicles'],
    }[data.type];
    for (const [key, value] of Object.entries(data.parameters)) {
      ensure(allowed.includes(key), 'InvalidScenario', 'Tham số không được hỗ trợ.', 400);
      numeric(value, key, key === 'multiplier' ? 1 : 0, key === 'multiplier' ? 3 : 20);
      if (key !== 'multiplier')
        ensure(Number.isInteger(value), 'InvalidScenario', 'Số tài nguyên phải nguyên.', 400);
    }
    this.prune();
    const scenario = new Scenario({
      id: id('scenario'),
      creatorId: operatorId,
      type: data.type,
      targetHubId: data.targetHubId,
      parameters: new Map(Object.entries(data.parameters)),
      horizonMinutes: data.horizonMinutes,
      seed: data.seed,
    });
    const result = this.engine.simulate(snapshot, scenario);
    while (this.analyses.size >= config.maxSimulationAnalyses)
      this.analyses.delete(this.analyses.keys().next().value!);
    this.analyses.set(scenario.id, {
      operatorId,
      snapshot,
      scenario,
      action: result.proposal ? structuredClone(result.proposal.action) : undefined,
      expiresAt: this.now() + config.simulationAnalysisMinutes * minute,
    });
    return result;
  }
  trial(operatorId: string, scenarioId: string): SimulationTrial {
    actor(this.repo.snapshot().state, operatorId, [Role.OPERATOR]);
    ensure(
      typeof scenarioId === 'string' && scenarioId.length <= 80,
      'ValidationError',
      'Mã phân tích không hợp lệ.',
      400,
    );
    this.prune();
    const analysis = this.analyses.get(scenarioId);
    ensure(
      analysis && analysis.operatorId === operatorId,
      'AnalysisExpired',
      'Phân tích đã hết hạn hoặc không thuộc tài khoản này. Hãy chạy lại tình huống.',
      404,
    );
    ensure(
      analysis.action,
      'NoSimulationProposal',
      'Tình huống này chưa có lệnh điều chuyển để thử.',
      409,
    );
    return this.engine.evaluate(analysis.snapshot, analysis.scenario, analysis.action);
  }
  private prune(): void {
    for (const [key, value] of this.analyses)
      if (value.expiresAt <= this.now()) this.analyses.delete(key);
  }
}
