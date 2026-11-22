import { Scenario, SimulationResult } from '../models/entities.js';
import { Role, ScenarioType } from '../models/enums.js';
import type { ScenarioDTO } from '../models/types.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import { WhatIfEngine } from '../simulation/WhatIfEngine.js';
import { config } from '../shared/config.js';
import { actor } from '../shared/business.js';
import { numeric, ensure, must } from '../shared/errors.js';
import { id } from '../shared/security.js';
export class WhatIfService {
  constructor(
    private repo: InMemoryRepository,
    private engine: WhatIfEngine,
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
    return this.engine.simulate(
      snapshot,
      new Scenario({
        id: id('scenario'),
        creatorId: operatorId,
        type: data.type,
        targetHubId: data.targetHubId,
        parameters: new Map(Object.entries(data.parameters)),
        horizonMinutes: data.horizonMinutes,
        seed: data.seed,
      }),
    );
  }
}
