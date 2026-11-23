import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSystem } from '../src/system.js';
import { WhatIfEngine } from '../src/simulation/WhatIfEngine.js';
import { Scenario, User } from '../src/models/entities.js';
import { DomainError } from '../src/shared/errors.js';
import { ScenarioType } from '../src/models/enums.js';
import type { SimulationAssessment, ScenarioDTO } from '../src/models/types.js';
const value = (a: SimulationAssessment, key: string) => a.metrics.find((m) => m.key === key)!.value;
const error = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof DomainError && e.code === code);
const input = (
  type: ScenarioType,
  parameters: Record<string, number | string>,
  targetHubId = 'hub-a',
): ScenarioDTO => ({
  type,
  parameters,
  targetHubId: type === ScenarioType.VEHICLE_IMBALANCE ? undefined : targetHubId,
});
const demand = (requiredVehicles = 8) =>
  input(ScenarioType.DEMAND_SURGE, { requiredVehicles }, 'hub-metro');
const cases = [
  demand(),
  input(ScenarioType.HUB_FULL, { requiredFreeSpaces: 6 }),
  input(ScenarioType.VEHICLE_IMBALANCE, { minimumVehicles: 6 }),
  input(ScenarioType.CHARGING_SURGE, { newRequests: 2 }),
  input(ScenarioType.PORT_FAILURE, { portId: 'hub-a-c1' }),
  input(ScenarioType.PORT_FAILURE, { portId: 'hub-a-c4' }),
];

test('all static scenarios are deterministic, expose traceable counts, and never mutate their snapshot or live state', () => {
  const x = createSystem();
  const snapshot = x.repo.snapshot();
  const original = structuredClone(snapshot.state);
  const engine = new WhatIfEngine(() => 123);
  for (const dto of cases) {
    const scenario = new Scenario({
      ...dto,
      id: 'static-check',
      creatorId: 'operator',
      parameters: new Map(Object.entries(dto.parameters)),
    });
    const result = engine.simulate(snapshot, scenario);
    assert.deepEqual(engine.simulate(snapshot, scenario), result);
    assert.equal('timeline' in result, false);
    assert.equal('comparison' in result, false);
    assert.ok(result.inputs.length > 0);
    assert.ok(result.assessment.calculations.length > 0);
    assert.ok(result.assessment.metrics.every((m) => Number.isInteger(m.value) && m.value >= 0));
    for (const proposal of result.proposals) {
      const trial = engine.evaluate(snapshot, scenario, proposal);
      assert.deepEqual(trial.before, result.assessment);
      assert.equal(trial.proposalId, proposal.id);
      assert.deepEqual(snapshot.state, original);
      assert.deepEqual(x.repo.snapshot().state, original);
      if (proposal.actions.every((a) => a.type === 'RELOCATE'))
        assert.equal(
          trial.before.hubs.reduce((n, h) => n + h.availableVehicles, 0),
          trial.after.hubs.reduce((n, h) => n + h.availableVehicles, 0),
        );
    }
  }
});
test('vehicle demand uses the declared target and selects the largest donatable stock with a reserve of three', () => {
  const x = createSystem();
  const r = x.whatIf.run('operator', demand());
  assert.equal(value(r.assessment, 'availableVehicles'), 4);
  assert.equal(value(r.assessment, 'requiredVehicles'), 8);
  assert.equal(value(r.assessment, 'shortage'), 4);
  const action = r.proposals[0].actions[0];
  assert.equal(action.type, 'RELOCATE');
  if (action.type !== 'RELOCATE') return;
  assert.equal(action.fromHubId, 'hub-a');
  assert.equal(action.toHubId, 'hub-metro');
  assert.equal(action.quantity, 4);
  const trial = x.whatIf.trial('operator', r.scenarioId);
  assert.equal(value(trial.after, 'availableVehicles'), 8);
  assert.equal(value(trial.after, 'shortage'), 0);
  assert.equal(trial.after.hubs.find((h) => h.hubId === 'hub-a')!.availableVehicles, 8);
  const multiplied = x.whatIf.run(
    'operator',
    input(ScenarioType.DEMAND_SURGE, { baselineDemand: 4, multiplier: 2 }, 'hub-metro'),
  );
  assert.deepEqual(multiplied.assessment, r.assessment);
  const fractional = x.whatIf.run(
    'operator',
    input(ScenarioType.DEMAND_SURGE, { baselineDemand: 3, multiplier: 1.5 }, 'hub-metro'),
  );
  assert.equal(value(fractional.assessment, 'requiredVehicles'), 5);
  const sufficient = x.whatIf.run('operator', demand(3));
  assert.equal(sufficient.proposals.length, 0);
});
test('greedy relocation can use multiple sources and reports partial coverage without reusing held slots or vehicles', () => {
  const x = createSystem();
  const multi = x.whatIf.run('operator', demand(14));
  assert.deepEqual(
    multi.proposals[0].actions.map((a) => (a.type === 'RELOCATE' ? [a.fromHubId, a.quantity] : [])),
    [
      ['hub-a', 9],
      ['hub-b', 1],
    ],
  );
  const huge = x.whatIf.run('operator', demand(100));
  const hugeTrial = x.whatIf.trial('operator', huge.scenarioId);
  assert.equal(value(hugeTrial.after, 'availableVehicles'), 18);
  assert.equal(value(hugeTrial.after, 'shortage'), 82);
  assert.equal(value(hugeTrial.after, 'freeSpaces'), 0);
  x.dispatch.create('operator', { fromHubId: 'hub-a', toHubId: 'hub-metro', quantity: 10 });
  x.dispatch.create('operator', { fromHubId: 'hub-b', toHubId: 'hub-metro', quantity: 3 });
  const original = x.repo.snapshot().state;
  const limited = x.whatIf.run('operator', demand());
  assert.equal(value(limited.assessment, 'freeSpaces'), 1);
  const trial = x.whatIf.trial('operator', limited.scenarioId);
  assert.equal(value(trial.after, 'availableVehicles'), 5);
  assert.equal(value(trial.after, 'shortage'), 3);
  const protectedVehicles = new Set(
    [...original.dispatchOrders.values()]
      .filter((o) => o.status === 'PENDING')
      .flatMap((o) => o.vehicleIds),
  );
  for (const a of trial.proposal.actions)
    if (a.type === 'RELOCATE') assert.ok(a.vehicleIds.every((id) => !protectedVehicles.has(id)));
  assert.deepEqual(x.repo.snapshot().state, original);
});
test('parking relief moves only eligible shared vehicles and preserves source reserve and destination capacity', () => {
  const x = createSystem();
  const r = x.whatIf.run('operator', input(ScenarioType.HUB_FULL, { requiredFreeSpaces: 6 }));
  assert.equal(value(r.assessment, 'freeSpaces'), 3);
  assert.equal(value(r.assessment, 'shortage'), 3);
  const trial = x.whatIf.trial('operator', r.scenarioId);
  assert.equal(value(trial.after, 'freeSpaces'), 6);
  assert.equal(value(trial.after, 'shortage'), 0);
  for (const a of trial.proposal.actions)
    if (a.type === 'RELOCATE') {
      assert.equal(a.fromHubId, 'hub-a');
      for (const id of a.vehicleIds)
        assert.equal(x.repo.get<any>('vehicles', id).ownership, 'SHARED');
      assert.ok(trial.after.hubs.find((h) => h.hubId === a.fromHubId)!.availableVehicles >= 3);
    }
  const blocked = x.whatIf.run(
    'operator',
    input(ScenarioType.HUB_FULL, { requiredFreeSpaces: 20 }),
  );
  const partial = x.whatIf.trial('operator', blocked.scenarioId);
  assert.equal(value(partial.after, 'movableVehicles'), 0);
  assert.ok(value(partial.after, 'shortage') > 0);
  assert.equal(partial.after.hubs.find((h) => h.hubId === 'hub-a')!.availableVehicles, 3);
});
test('network balancing counts actual deficits, keeps the requested minimum at donors and conserves stock', () => {
  const x = createSystem();
  const r = x.whatIf.run('operator', input(ScenarioType.VEHICLE_IMBALANCE, { minimumVehicles: 6 }));
  assert.equal(value(r.assessment, 'hubsBelowMinimum'), 1);
  assert.equal(value(r.assessment, 'shortage'), 2);
  const trial = x.whatIf.trial('operator', r.scenarioId);
  assert.equal(value(trial.after, 'hubsBelowMinimum'), 0);
  assert.equal(value(trial.after, 'networkAvailableVehicles'), 36);
  assert.ok(
    trial.after.hubs.filter((h) => h.status === 'ACTIVE').every((h) => h.availableVehicles >= 6),
  );
  const impossible = x.whatIf.run(
    'operator',
    input(ScenarioType.VEHICLE_IMBALANCE, { minimumVehicles: 100 }),
  );
  assert.equal(impossible.proposals.length, 0);
  assert.equal(value(impossible.assessment, 'hubsBelowMinimum'), 5);
});
test('new charging demand uses real eligible vehicles and grants each free port to at most one request', () => {
  const x = createSystem();
  const original = x.repo.snapshot().state;
  const r = x.whatIf.run(
    'operator',
    input(ScenarioType.CHARGING_SURGE, { newRequests: 3 }, 'hub-metro'),
  );
  assert.equal(value(r.assessment, 'totalWaiting'), 3);
  assert.equal(value(r.assessment, 'canAllocate'), 3);
  assert.equal(value(r.assessment, 'remainingWaiting'), 0);
  assert.equal(new Set(r.assessment.allocations.map((a) => a.vehicleId)).size, 3);
  assert.equal(new Set(r.assessment.allocations.map((a) => a.portId)).size, 3);
  assert.ok(
    r.assessment.allocations.every((a) => original.vehicles.has(a.vehicleId) && a.simulated),
  );
  const trial = x.whatIf.trial('operator', r.scenarioId, 'allocate');
  assert.equal(value(trial.after, 'totalWaiting'), 0);
  assert.equal(value(trial.after, 'assignedByPlan'), 3);
  assert.equal(value(trial.after, 'freePorts'), 1);
  assert.deepEqual(x.repo.snapshot().state, original);
  error(
    () =>
      x.whatIf.run(
        'operator',
        input(ScenarioType.CHARGING_SURGE, { newRequests: 1000 }, 'hub-metro'),
      ),
    'InvalidScenario',
  );
});
test('charging order follows deadline before battery and respects a busy preferred port', () => {
  const x = createSystem();
  const low = x.charging.request('customer', {
    vehicleId: 'personal-1',
    hubId: 'hub-metro',
    targetBattery: 80,
    portId: 'hub-metro-c1',
  });
  const urgent = x.charging.request('customer6', {
    vehicleId: 'personal-4',
    hubId: 'hub-metro',
    targetBattery: 80,
    portId: 'hub-metro-c1',
    requiredBy: x.now() + 600000,
  });
  const r = x.whatIf.run(
    'operator',
    input(ScenarioType.CHARGING_SURGE, { newRequests: 0 }, 'hub-metro'),
  );
  assert.equal(value(r.assessment, 'freePorts'), 4);
  assert.equal(value(r.assessment, 'canAllocate'), 1);
  assert.equal(r.assessment.allocations[0].requestId, urgent.id);
  assert.equal(r.assessment.waiting[0].requestId, low.id);
});
test('repairing an empty faulty port enables one queued request, selected by the existing priority rule', () => {
  const x = createSystem();
  const r = x.whatIf.run('operator', input(ScenarioType.CHARGING_SURGE, { newRequests: 2 }));
  assert.equal(value(r.assessment, 'totalWaiting'), 4);
  assert.equal(value(r.assessment, 'canAllocate'), 0);
  const p = r.proposals.find((p) => p.id === 'recover:hub-a-c4')!;
  assert.equal(p.actions[1].type, 'ALLOCATE');
  if (p.actions[1].type === 'ALLOCATE') assert.equal(p.actions[1].requestId, 'charge-seed-wait-2');
  const trial = x.whatIf.trial('operator', r.scenarioId, p.id);
  assert.equal(value(trial.after, 'totalWaiting'), 3);
  assert.equal(value(trial.after, 'assignedByPlan'), 1);
  const fault = x.whatIf.run('operator', input(ScenarioType.PORT_FAILURE, { portId: 'hub-a-c4' }));
  const repaired = x.whatIf.trial('operator', fault.scenarioId);
  assert.equal(value(repaired.after, 'usablePorts'), 4);
  assert.equal(value(repaired.after, 'totalWaiting'), 1);
  assert.equal(x.repo.get<any>('ports', 'hub-a-c4').status, 'FAULT');
});
test('repairing an occupied port resumes its existing session and never turns it into a free connector', () => {
  const x = createSystem();
  const original = x.repo.snapshot().state;
  const r = x.whatIf.run('operator', input(ScenarioType.PORT_FAILURE, { portId: 'hub-a-c1' }));
  assert.equal(value(r.assessment, 'usablePorts'), 2);
  assert.equal(value(r.assessment, 'affectedSessions'), 1);
  assert.equal(r.assessment.affected[0].vehicleId, 'personal-5');
  const trial = x.whatIf.trial('operator', r.scenarioId);
  assert.equal(value(trial.after, 'usablePorts'), 3);
  assert.equal(value(trial.after, 'freePorts'), 0);
  assert.equal(value(trial.after, 'affectedSessions'), 0);
  assert.equal(value(trial.after, 'totalWaiting'), 2);
  assert.equal(value(trial.after, 'assignedByPlan'), 0);
  assert.ok(trial.after.notes.some((n) => n.includes('vẫn đang có xe cắm')));
  assert.deepEqual(x.repo.snapshot().state, original);
});
test('repair preserves a held connector; release proposals only target sessions already awaiting disconnect', () => {
  const x = createSystem();
  x.charging.request('customer', {
    vehicleId: 'personal-1',
    hubId: 'hub-metro',
    targetBattery: 80,
  });
  x.charging.schedule(x.now());
  const held = x.whatIf.run(
    'operator',
    input(ScenarioType.PORT_FAILURE, { portId: 'hub-metro-c1' }, 'hub-metro'),
  );
  assert.equal(value(held.assessment, 'affectedHolds'), 1);
  const heldTrial = x.whatIf.trial('operator', held.scenarioId);
  assert.equal(value(heldTrial.after, 'freePorts'), 3);
  assert.equal(value(heldTrial.after, 'affectedHolds'), 0);
  const active = x.whatIf.run('operator', input(ScenarioType.CHARGING_SURGE, { newRequests: 0 }));
  assert.ok(active.proposals.every((p) => p.actions.every((a) => a.type !== 'DISCONNECT')));
  x.charging.stop('customer3', 'session-seed-active');
  const r = x.whatIf.run('operator', input(ScenarioType.CHARGING_SURGE, { newRequests: 0 }));
  const release = r.proposals.find((p) => p.id === 'disconnect:session-seed-active')!;
  assert.ok(release);
  const trial = x.whatIf.trial('operator', r.scenarioId, release.id);
  assert.equal(value(trial.after, 'assignedByPlan'), 1);
  assert.equal(value(trial.after, 'totalWaiting'), 1);
  assert.equal(
    x.repo.get<any>('chargingSessions', 'session-seed-active').status,
    'AWAITING_DISCONNECT',
  );
  const faultyConnected = x.whatIf.run(
    'operator',
    input(ScenarioType.PORT_FAILURE, { portId: 'hub-a-c1' }),
  );
  const recovered = x.whatIf.trial('operator', faultyConnected.scenarioId);
  assert.equal(value(recovered.after, 'freePorts'), 0);
  assert.equal(value(recovered.after, 'assignedByPlan'), 0);
});
test('static inputs and plans are validated, including old time/seed inputs and cross-Hub ports', () => {
  const x = createSystem();
  error(() => x.whatIf.run('customer', demand()), 'Forbidden');
  for (const parameters of [
    { requiredVehicles: -1 },
    { requiredVehicles: 2.5 },
    { baselineDemand: 4 },
    { requiredVehicles: 8, multiplier: 2 },
    { requiredVehicles: '8' },
    { unknown: 1 },
  ])
    assert.throws(() =>
      x.whatIf.run('operator', input(ScenarioType.DEMAND_SURGE, parameters, 'hub-metro')),
    );
  error(
    () => x.whatIf.run('operator', { ...demand(), horizonMinutes: 60 } as any),
    'InvalidScenario',
  );
  error(() => x.whatIf.run('operator', { ...demand(), seed: 42 } as any), 'InvalidScenario');
  error(
    () => x.whatIf.run('operator', input(ScenarioType.PORT_FAILURE, { portId: 'hub-b-c1' })),
    'InvalidScenario',
  );
  const r = x.whatIf.run('operator', demand());
  error(() => x.whatIf.trial('operator', r.scenarioId, 'invented'), 'InvalidSimulationPlan');
  const snapshot = x.repo.snapshot();
  const scenario = new Scenario({
    id: 'tamper',
    creatorId: 'operator',
    ...demand(),
    parameters: new Map([['requiredVehicles', 8]]),
  });
  const engine = new WhatIfEngine();
  const actual = engine.simulate(snapshot, scenario);
  const tampered = structuredClone(actual.proposals[0]);
  if (tampered.actions[0].type === 'RELOCATE') tampered.actions[0].quantity = 999;
  error(() => engine.evaluate(snapshot, scenario, tampered), 'InvalidSimulationPlan');
});
test('static trials reuse their saved data, are owner scoped, expire and retain bounded analyses', () => {
  const x = createSystem();
  const r = x.whatIf.run('operator', demand());
  x.reservations.reserveVehicle('customer', 'hub-a-v1', 'hub-b');
  const original = x.repo.snapshot().state;
  const trial = x.whatIf.trial('operator', r.scenarioId);
  assert.deepEqual(trial.before, r.assessment);
  assert.equal(value(trial.after, 'availableVehicles'), 8);
  assert.deepEqual(x.repo.snapshot().state, original);
  error(() => x.whatIf.trial('customer', r.scenarioId), 'Forbidden');
  x.repo.transact((s) =>
    s.users.set('operator-other', new User({ ...s.users.get('operator')!, id: 'operator-other' })),
  );
  error(() => x.whatIf.trial('operator-other', r.scenarioId), 'AnalysisExpired');
  x.advance(601);
  error(() => x.whatIf.trial('operator', r.scenarioId), 'AnalysisExpired');
  let oldest = '';
  for (let n = 0; n < 21; n++) {
    const current = x.whatIf.run('operator', demand(1));
    if (!n) oldest = current.scenarioId;
    else error(() => x.whatIf.trial('operator', current.scenarioId), 'NoSimulationProposal');
  }
  error(() => x.whatIf.trial('operator', oldest), 'AnalysisExpired');
});
