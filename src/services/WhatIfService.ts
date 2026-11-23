import { Scenario, SimulationResult, NetworkSnapshot } from '../models/entities.js';
import { Role, ScenarioType } from '../models/enums.js';
import type { ScenarioDTO, SimulationProposal, SimulationTrial } from '../models/types.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import { WhatIfEngine } from '../simulation/WhatIfEngine.js';
import { config, minute } from '../shared/config.js';
import { actor } from '../shared/business.js';
import { ensure } from '../shared/errors.js';
import { id } from '../shared/security.js';
export class WhatIfService {
  private analyses = new Map<
    string,
    {
      operatorId: string;
      snapshot: NetworkSnapshot;
      scenario: Scenario;
      proposals: SimulationProposal[];
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
    ensure(
      data && typeof data === 'object' && !Array.isArray(data),
      'InvalidScenario',
      'Dữ liệu tình huống không hợp lệ.',
      400,
    );
    ensure(
      Object.keys(data).every((key) => ['type', 'targetHubId', 'parameters'].includes(key)),
      'InvalidScenario',
      'What-if tĩnh chỉ nhận tình huống, Hub và tham số; không dùng thời gian dự báo hoặc seed.',
      400,
    );
    ensure(
      Object.values(ScenarioType).includes(data.type),
      'InvalidScenario',
      'Loại tình huống không hợp lệ.',
      400,
    );
    ensure(
      data.parameters && typeof data.parameters === 'object' && !Array.isArray(data.parameters),
      'InvalidScenario',
      'Tham số tình huống không hợp lệ.',
      400,
    );
    const scenario = new Scenario({
      id: id('scenario'),
      creatorId: operatorId,
      type: data.type,
      targetHubId: data.targetHubId,
      parameters: new Map(Object.entries(data.parameters)),
    });
    const result = this.engine.simulate(snapshot, scenario);
    this.prune();
    while (this.analyses.size >= config.maxSimulationAnalyses)
      this.analyses.delete(this.analyses.keys().next().value!);
    this.analyses.set(scenario.id, {
      operatorId,
      snapshot,
      scenario,
      proposals: structuredClone(result.proposals),
      expiresAt: this.now() + config.simulationAnalysisMinutes * minute,
    });
    return result;
  }
  trial(operatorId: string, scenarioId: string, proposalId?: string): SimulationTrial {
    actor(this.repo.snapshot().state, operatorId, [Role.OPERATOR]);
    ensure(
      typeof scenarioId === 'string' && scenarioId.length > 0 && scenarioId.length <= 80,
      'ValidationError',
      'Mã phân tích không hợp lệ.',
      400,
    );
    ensure(
      proposalId === undefined ||
        (typeof proposalId === 'string' && proposalId.length > 0 && proposalId.length <= 180),
      'ValidationError',
      'Mã phương án không hợp lệ.',
      400,
    );
    this.prune();
    const analysis = this.analyses.get(scenarioId);
    ensure(
      analysis && analysis.operatorId === operatorId,
      'AnalysisExpired',
      'Phân tích đã hết hạn hoặc không thuộc tài khoản này. Hãy phân tích lại.',
      404,
    );
    ensure(
      analysis.proposals.length > 0,
      'NoSimulationProposal',
      'Phân tích hiện chưa có phương án để thử.',
      409,
    );
    const proposal =
      proposalId === undefined
        ? analysis.proposals[0]
        : analysis.proposals.find((p) => p.id === proposalId);
    ensure(proposal, 'InvalidSimulationPlan', 'Phương án không thuộc phân tích đã lưu.', 400);
    return this.engine.evaluate(analysis.snapshot, analysis.scenario, proposal);
  }
  private prune(): void {
    for (const [key, value] of this.analyses)
      if (value.expiresAt <= this.now()) this.analyses.delete(key);
  }
}
