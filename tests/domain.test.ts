import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSystem } from '../src/system.js';
import { createSeed } from '../src/data/seed.js';
import { InMemoryRepository } from '../src/repositories/InMemoryRepository.js';
import { WhatIfEngine } from '../src/simulation/WhatIfEngine.js';
import { Scenario, User, Vehicle, Rental, ChargingSession } from '../src/models/entities.js';
import {
  DeviceCommand,
  ReservationStatus,
  ReservationKind,
  ScenarioType,
} from '../src/models/enums.js';
import { DomainError } from '../src/shared/errors.js';
const throws = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof DomainError && e.code === code);

test('registration, profile whitelist, duplicate contact, provider mock and session logout', () => {
  const x = createSystem();
  const u = x.account.register({
    fullName: 'Khách mới',
    email: 'new@example.com',
    password: 'Secure@123',
    confirmPassword: 'Secure@123',
    role: 'OPERATOR',
  } as any);
  assert.equal(u.role, 'CUSTOMER');
  assert.ok(!('passwordHash' in u));
  throws(
    () =>
      x.account.register({
        fullName: 'Khác',
        email: 'NEW@example.com',
        password: 'Secure@123',
        confirmPassword: 'Secure@123',
      }),
    'DuplicateError',
  );
  const dto = x.account.login('NEW@example.com', 'Secure@123');
  assert.equal(dto.user.id, u.id);
  assert.ok(x.repo.get('sessions', dto.token));
  const updated = x.account.updateProfile(u.id, {
    fullName: 'Tên mới',
    role: 'OPERATOR',
    passwordHash: 'abc',
  } as any);
  assert.equal(updated.fullName, 'Tên mới');
  assert.equal(updated.role, 'CUSTOMER');
  assert.equal(x.account.getProfile(u.id).fullName, 'Tên mới');
  x.account.logout(dto.token);
  x.account.logout(dto.token);
  assert.equal(x.repo.get('sessions', dto.token), undefined);
  throws(() => x.account.loginWithProvider('bogus'), 'InvalidProviderToken');
  assert.equal(x.account.loginWithProvider('google-demo-customer').user.id, 'customer');
});
test('five failed logins lock for 15 minutes and unlock after time elapses', () => {
  const x = createSystem();
  for (let i = 0; i < 4; i++)
    throws(() => x.account.login('customer@hub.local', 'Wrong@123'), 'InvalidCredentials');
  throws(() => x.account.login('customer@hub.local', 'Wrong@123'), 'AccountLocked');
  throws(() => x.account.login('customer@hub.local', 'Demo@12345'), 'AccountLocked');
  x.advance(901);
  assert.equal(x.account.login('customer@hub.local', 'Demo@12345').user.id, 'customer');
  assert.equal(x.repo.get<User>('users', 'customer')!.failedLoginCount, 0);
});
test('password challenge expires, is consumed and revokes old sessions', () => {
  const x = createSystem();
  const session = x.account.login('customer@hub.local', 'Demo@12345');
  const c = x.account.requestPasswordReset('customer@hub.local');
  throws(
    () =>
      x.account.resetPassword({
        challengeId: c.challengeId,
        code: '000000',
        newPassword: 'New@12345',
        confirmPassword: 'New@12345',
      }),
    'InvalidResetCode',
  );
  x.account.resetPassword({
    challengeId: c.challengeId,
    code: c.demoCode,
    newPassword: 'New@12345',
    confirmPassword: 'New@12345',
  });
  assert.equal(x.repo.get('sessions', session.token), undefined);
  throws(
    () =>
      x.account.resetPassword({
        challengeId: c.challengeId,
        code: c.demoCode,
        newPassword: 'New@12345',
        confirmPassword: 'New@12345',
      }),
    'InvalidResetCode',
  );
  assert.equal(x.account.login('customer@hub.local', 'New@12345').user.id, 'customer');
  const c2 = x.account.requestPasswordReset('customer@hub.local');
  x.advance(301);
  throws(
    () =>
      x.account.resetPassword({
        challengeId: c2.challengeId,
        code: c2.demoCode,
        newPassword: 'Next@12345',
        confirmPassword: 'Next@12345',
      }),
    'InvalidResetCode',
  );
});
test('repository isolates nested reads, snapshots and rollback, rejects async callbacks', () => {
  const repo = new InMemoryRepository(createSeed());
  const v = repo.get<Vehicle>('vehicles', 'hub-a-v1')!;
  v.status = 'MAINTENANCE' as any;
  assert.equal(repo.get<Vehicle>('vehicles', v.id)!.status, 'AVAILABLE');
  const list = repo.list<Vehicle>('vehicles');
  list[0].batteryLevel = 0;
  assert.notEqual(repo.get<Vehicle>('vehicles', list[0].id)!.batteryLevel, 0);
  const snap = repo.snapshot();
  snap.state.vehicles.get(v.id)!.batteryLevel = 0;
  assert.notEqual(repo.get<Vehicle>('vehicles', v.id)!.batteryLevel, 0);
  assert.throws(() =>
    repo.transact((s) => {
      s.vehicles.get(v.id)!.batteryLevel = 0;
      throw Error('rollback');
    }),
  );
  assert.notEqual(repo.get<Vehicle>('vehicles', v.id)!.batteryLevel, 0);
  throws(
    () =>
      repo.transact(async (s) => {
        s.vehicles.get(v.id)!.batteryLevel = 0;
      }),
    'InvalidTransaction',
  );
  let captured: any;
  repo.transact((s) => {
    captured = s;
  });
  captured.vehicles.clear();
  assert.ok(repo.list('vehicles').length);
});

const freeSlot = (x: ReturnType<typeof createSystem>, hubId: string) =>
  x.repo.list<any>('spaces').find((p) => p.hubId === hubId && p.status === 'FREE')!.id;
const hold = (
  x: ReturnType<typeof createSystem>,
  user = 'customer',
  vehicle = 'hub-a-v1',
  destination = 'hub-b',
) => x.reservations.reserveVehicle(user, vehicle, destination);
function locate(x: ReturnType<typeof createSystem>, vehicleId: string, hubId: string) {
  const v = x.repo.get<Vehicle>('vehicles', vehicleId)!;
  x.simulator.setTelemetry(vehicleId, {
    position: { lat: 10, lng: 106, hubId },
    batteryLevel: v.batteryLevel,
    locked: true,
  });
}
function assertInventory(x: ReturnType<typeof createSystem>) {
  const s = x.repo.snapshot().state;
  const seen = new Set<string>();
  assert.equal(s.vehicles.size, 54);
  for (const p of s.spaces.values())
    if (p.vehicleId) {
      assert.equal(p.status, 'OCCUPIED');
      assert.ok(!seen.has(p.vehicleId));
      seen.add(p.vehicleId);
      assert.equal(s.vehicles.get(p.vehicleId)?.parkingSpaceId, p.id);
    }
  for (const v of s.vehicles.values())
    if (v.parkingSpaceId) assert.equal(s.spaces.get(v.parkingSpaceId)?.vehicleId, v.id);
  for (const id of s.returnSpaceHolds.keys()) {
    assert.equal(s.spaces.get(id)?.status, 'HELD');
    assert.ok(!s.dispatchSpaceHolds.has(id));
  }
}
test('demo seed has six consistent hubs, occupied charging ports, history and background actors', () => {
  const x = createSystem();
  assert.equal(x.repo.list('hubs').length, 6);
  assert.equal(x.repo.list('vehicles').length, 54);
  assert.equal(x.repo.list('spaces').length, 100);
  assert.equal(x.repo.list('ports').length, 18);
  assert.equal(x.repo.list('users').length, 11);
  assert.equal(x.hubs.getDetail('hub-nvh').freeSpaces, 0);
  assert.equal(x.hubs.getDetail('hub-nvh').freePorts, 0);
  assert.equal(x.hubs.getDetail('hub-a').freeSpaces, 3);
  assert.equal(x.charging.schedule(x.now()), 0);
  assertInventory(x);
});
test('hub search and operator overview reflect live inventory and eligibility', () => {
  const x = createSystem();
  assert.equal(
    x.hubs.search({ area: 'Ký túc', vehicleType: 'E_BIKE' as any, minBattery: 50 }).length,
    2,
  );
  const before = x.hubs.getDetail('hub-a').availableVehicles;
  hold(x);
  assert.equal(x.hubs.getDetail('hub-a').availableVehicles, before - 1);
  throws(() => x.hubs.getNetworkStatus('customer'), 'Forbidden');
  assert.equal(x.hubs.getNetworkStatus('operator').hubs.length, 6);
});
test('vehicle and destination are held together; conflicting requests do not retain extra slots', () => {
  const x = createSystem();
  const r = hold(x);
  const before = x.repo.snapshot().state;
  assert.equal(before.returnSpaceHolds.get(r.plannedReturnSpaceId), r.id);
  assert.equal(before.spaces.get(r.plannedReturnSpaceId)?.status, 'HELD');
  throws(() => hold(x, 'customer2'), 'ResourceConflict');
  assert.deepEqual(x.repo.snapshot().state, before);
  const source = x.repo.get<any>('vehicles', r.vehicleId).parkingSpaceId;
  x.advance(901);
  assert.equal(x.repo.get<any>('reservations', r.id).status, 'EXPIRED');
  assert.equal(x.repo.get<any>('spaces', r.plannedReturnSpaceId).status, 'FREE');
  assert.equal(x.repo.get<any>('spaces', source).status, 'OCCUPIED');
  assertInventory(x);
});
test('missing, inactive or full destination rejects booking without reserving the source', () => {
  const x = createSystem();
  const before = x.repo.snapshot().state;
  throws(() => hold(x, 'customer', 'hub-a-v1', 'hub-nvh'), 'HubUnavailable');
  assert.deepEqual(x.repo.snapshot().state, before);
  x.repo.transact((s) => {
    for (const p of s.spaces.values())
      if (p.hubId === 'hub-b' && p.status === 'FREE') p.status = 'MAINTENANCE' as any;
  });
  const full = x.repo.snapshot().state;
  throws(() => hold(x), 'InsufficientCapacity');
  assert.deepEqual(x.repo.snapshot().state, full);
});
test('changing the selected vehicle retains the committed destination; cancel releases both', () => {
  const x = createSystem();
  const r = hold(x);
  x.reservations.changeResource('customer', r.id, 'hub-a-v3');
  assert.equal(x.repo.snapshot().state.returnSpaceHolds.get(r.plannedReturnSpaceId), r.id);
  assert.equal(x.repo.get<any>('vehicles', 'hub-a-v1').status, 'AVAILABLE');
  throws(() => x.reservations.cancel('customer2', r.id), 'Forbidden');
  x.reservations.cancel('customer', r.id);
  assert.equal(x.repo.get<any>('spaces', r.plannedReturnSpaceId).status, 'FREE');
  assertInventory(x);
});
test('pickup wrong code or device failure preserves state; destination hold survives pickup expiry', () => {
  const x = createSystem();
  const r = hold(x);
  const before = x.repo.snapshot().state;
  throws(() => x.rental.pickup('customer', r.id, '000000'), 'InvalidPickupCode');
  x.simulator.setCommandResult({ kind: 'VEHICLE', id: r.vehicleId }, DeviceCommand.UNLOCK, false);
  throws(() => x.rental.pickup('customer', r.id, r.pickupCode), 'DeviceFailure');
  assert.deepEqual(x.repo.snapshot().state, before);
  x.simulator.setCommandResult({ kind: 'VEHICLE', id: r.vehicleId }, DeviceCommand.UNLOCK, true);
  const rental = x.rental.pickup('customer', r.id, r.pickupCode);
  x.advance(1200);
  assert.equal(x.repo.get<any>('reservations', r.id).status, 'CONFIRMED');
  assert.equal(x.repo.get<any>('spaces', r.plannedReturnSpaceId).status, 'HELD');
  locate(x, r.vehicleId, 'hub-b');
  const result = x.rental.returnVehicle('customer', rental.id, {
    hubId: 'hub-b',
    spaceId: r.plannedReturnSpaceId,
  });
  assert.equal(result.penalty, 0);
  assert.equal(result.status, 'COMPLETED');
  const after = x.repo.snapshot().state;
  assert.deepEqual(
    x.rental.returnVehicle('customer', rental.id, {
      hubId: 'hub-b',
      spaceId: r.plannedReturnSpaceId,
    }),
    result,
  );
  assert.deepEqual(x.repo.snapshot().state, after);
  assertInventory(x);
});
test('destination changes secure a new commitment atomically and update an active trip', () => {
  const x = createSystem();
  const r = hold(x);
  const rental = x.rental.pickup('customer', r.id, r.pickupCode);
  const before = x.repo.snapshot().state;
  throws(() => x.reservations.changeDestination('customer', r.id, 'hub-nvh'), 'HubUnavailable');
  assert.deepEqual(x.repo.snapshot().state, before);
  const updated = x.reservations.changeDestination('customer', r.id, 'hub-library');
  assert.equal(x.repo.get<any>('spaces', r.plannedReturnSpaceId).status, 'FREE');
  assert.equal(x.repo.get<any>('rentals', rental.id).plannedReturnHubId, 'hub-library');
  locate(x, r.vehicleId, 'hub-library');
  assert.equal(
    x.rental.returnVehicle('customer', rental.id, {
      hubId: 'hub-library',
      spaceId: updated.plannedReturnSpaceId,
    }).penalty,
    0,
  );
  assertInventory(x);
});
test('unapproved return elsewhere incurs penalty, rejects location mismatch and frees old commitment', () => {
  const x = createSystem();
  const r = hold(x);
  const rental = x.rental.pickup('customer', r.id, r.pickupCode);
  const spaceId = freeSlot(x, 'hub-library');
  const before = x.repo.snapshot().state;
  throws(
    () => x.rental.returnVehicle('customer', rental.id, { hubId: 'hub-library', spaceId }),
    'ParkingConflict',
  );
  assert.deepEqual(x.repo.snapshot().state, before);
  locate(x, r.vehicleId, 'hub-library');
  const result = x.rental.returnVehicle('customer', rental.id, { hubId: 'hub-library', spaceId });
  assert.equal(result.penalty, 30000);
  assert.equal(x.repo.get<any>('spaces', r.plannedReturnSpaceId).status, 'FREE');
  assertInventory(x);
});
test('personal parking supports owner checks, change/extend, arrival, checkout and repeat visits', () => {
  const x = createSystem();
  const spaceId = freeSlot(x, 'hub-b');
  throws(
    () =>
      x.reservations.reserveParking('customer2', {
        vehicleId: 'personal-2',
        hubId: 'hub-b',
        spaceId,
      }),
    'Forbidden',
  );
  const r = x.reservations.reserveParking('customer', {
    vehicleId: 'personal-2',
    hubId: 'hub-b',
    spaceId,
  });
  const next = freeSlot(x, 'hub-b');
  x.reservations.changeResource('customer', r.id, next);
  x.reservations.extend('customer', r.id, 5);
  x.reservations.confirmParking('customer', r.id);
  throws(() => x.reservations.cancel('customer', r.id), 'InvalidReservationState');
  throws(() => x.reservations.checkoutParking('customer2', 'personal-2'), 'Forbidden');
  const visit = x.reservations.checkoutParking('customer', 'personal-2');
  assert.ok(visit.exitedAt);
  assert.equal(x.repo.get<any>('spaces', next).status, 'FREE');
  assert.equal(x.repo.get<any>('vehicles', 'personal-2').currentHubId, undefined);
  const second = x.reservations.reserveParking('customer', {
    vehicleId: 'personal-2',
    hubId: 'hub-b',
    spaceId: next,
  });
  x.reservations.confirmParking('customer', second.id);
  assertInventory(x);
});
test('all charge requests enter the same priority queue; customers cannot request fleet charging', () => {
  const x = createSystem();
  const r = x.charging.request('customer', {
    vehicleId: 'personal-1',
    hubId: 'hub-metro',
    portId: 'hub-metro-c1',
    targetBattery: 80,
  });
  assert.equal(r.status, 'WAITING');
  assert.equal(r.portId, undefined);
  throws(
    () =>
      x.charging.request('customer2', {
        vehicleId: 'personal-1',
        hubId: 'hub-metro',
        targetBattery: 80,
      }),
    'Forbidden',
  );
  throws(
    () =>
      x.charging.request('customer', {
        vehicleId: 'personal-1',
        hubId: 'hub-metro',
        targetBattery: 80,
      }),
    'ResourceConflict',
  );
  throws(
    () =>
      x.charging.request('customer', {
        vehicleId: 'hub-metro-v1',
        hubId: 'hub-metro',
        targetBattery: 80,
      }),
    'Forbidden',
  );
  const fleet = x.charging.request('operator', {
    vehicleId: 'hub-metro-v1',
    hubId: 'hub-metro',
    targetBattery: 80,
  });
  assert.equal(fleet.status, 'WAITING');
  assert.equal(
    x.hubs.getDetail('hub-metro').vehicles.find((v) => v.id === fleet.vehicleId)?.rentable,
    false,
  );
  throws(() => hold(x, 'customer', 'hub-metro-v1'), 'ResourceConflict');
});
test('earlier deadline beats FIFO once a connector is physically released', () => {
  const x = createSystem();
  assert.ok(
    x.repo.get<any>('reservations', 'charge-seed-wait-1').createdAt <
      x.repo.get<any>('reservations', 'charge-seed-wait-2').createdAt,
  );
  x.charging.stop('technician', 'session-seed-fleet-1');
  assert.equal(x.repo.get<any>('ports', 'hub-a-c2').status, 'CONNECTED');
  assert.equal(x.charging.schedule(x.now()), 0);
  x.charging.disconnect('technician', 'session-seed-fleet-1');
  assert.equal(x.charging.schedule(x.now()), 1);
  assert.equal(x.repo.get<any>('reservations', 'charge-seed-wait-2').status, 'HELD');
  assert.equal(x.repo.get<any>('reservations', 'charge-seed-wait-1').status, 'WAITING');
  const before = x.repo
    .list<any>('notifications')
    .filter((n) => n.kind === 'CHARGE_ALLOCATED').length;
  x.charging.schedule(x.now());
  assert.equal(
    x.repo.list<any>('notifications').filter((n) => n.kind === 'CHARGE_ALLOCATED').length,
    before,
  );
  assert.equal(x.hubs.getDetail('hub-a').chargingUsedKw, 8.8);
  assert.equal(x.repo.get<any>('ports', 'hub-a-c2').status, 'HELD');
});
function onePort(x: ReturnType<typeof createSystem>) {
  x.repo.transact((s) => {
    for (const p of s.ports.values())
      if (p.hubId === 'hub-metro' && p.id !== 'hub-metro-c1') p.status = 'FAULT' as any;
  });
}
test('target completion retains connector until disconnect, then the next request can be allocated', () => {
  const x = createSystem();
  onePort(x);
  const r = x.charging.request('customer', {
    vehicleId: 'personal-1',
    hubId: 'hub-metro',
    targetBattery: 36,
  });
  x.charging.schedule(x.now());
  const c = x.charging.start('customer', r.id);
  throws(() => x.reservations.checkoutParking('customer', 'personal-1'), 'ResourceConflict');
  x.advance(60);
  assert.equal(x.repo.get<any>('chargingSessions', c.id).status, 'AWAITING_DISCONNECT');
  assert.equal(x.repo.get<any>('ports', c.portId).status, 'CONNECTED');
  assert.equal(x.repo.get<any>('vehicles', 'personal-1').batteryLevel, 36);
  const wait = x.charging.request('customer6', {
    vehicleId: 'personal-4',
    hubId: 'hub-metro',
    targetBattery: 80,
  });
  assert.equal(x.charging.schedule(x.now()), 0);
  throws(() => x.charging.disconnect('customer2', c.id), 'Forbidden');
  x.charging.disconnect('customer', c.id);
  assert.equal(x.charging.schedule(x.now()), 1);
  assert.equal(x.repo.get<any>('reservations', wait.id).status, 'HELD');
  x.reservations.checkoutParking('customer', 'personal-1');
  assertInventory(x);
});
test('manual stop records energy first; stop and disconnect are idempotent and notify once', () => {
  const x = createSystem();
  const r = x.charging.request('customer', {
    vehicleId: 'personal-1',
    hubId: 'hub-metro',
    targetBattery: 80,
  });
  x.charging.schedule(x.now());
  const c = x.charging.start('customer', r.id);
  x.advance(60);
  x.charging.stop('customer', c.id);
  assert.ok(x.repo.get<Vehicle>('vehicles', 'personal-1')!.batteryLevel > 35);
  assert.equal(x.repo.get<any>('ports', c.portId).status, 'CONNECTED');
  x.charging.stop('customer', c.id);
  x.charging.disconnect('customer', c.id);
  const after = x.repo.snapshot().state;
  x.charging.disconnect('customer', c.id);
  assert.deepEqual(x.repo.snapshot().state, after);
  assert.equal(
    x.repo
      .list<any>('notifications')
      .filter((n) => n.kind === 'CHARGE_STOPPED' && n.referenceId === c.id).length,
    1,
  );
  assert.equal(x.repo.get<any>('chargingSessions', c.id).status, 'CANCELLED');
  assertInventory(x);
});
test('held return slots are unavailable to personal parking and dispatch', () => {
  const x = createSystem();
  const r = hold(x);
  throws(
    () =>
      x.reservations.reserveParking('customer', {
        vehicleId: 'personal-2',
        hubId: 'hub-b',
        spaceId: r.plannedReturnSpaceId,
      }),
    'ResourceConflict',
  );
  const o = x.dispatch.create('operator', { fromHubId: 'hub-a', toHubId: 'hub-b', quantity: 2 });
  assert.ok(!o.reservedSpaceIds.includes(r.plannedReturnSpaceId));
  assertInventory(x);
});
test('incidents have single assignee; failed CHECK keeps the assigned incident and resource state', () => {
  const x = createSystem();
  const i = x.incidents.report('customer', {
    target: { kind: 'VEHICLE', id: 'hub-a-v3' },
    description: 'Phanh cần kiểm tra.',
  });
  x.incidents.accept('technician', i.id);
  throws(() => x.incidents.accept('technician2', i.id), 'AssignmentConflict');
  x.simulator.setCommandResult(i.target, DeviceCommand.CHECK, false);
  throws(() => x.incidents.resolve('technician', i.id, 'Đã kiểm tra'), 'DeviceFailure');
  assert.equal(x.repo.get<any>('incidents', i.id).status, 'ASSIGNED');
  x.simulator.setCommandResult(i.target, DeviceCommand.CHECK, true);
  x.incidents.resolve('technician', i.id, 'Đã xử lý');
  assert.equal(x.repo.get<any>('vehicles', 'hub-a-v3').status, 'AVAILABLE');
});
test('dispatch reserves both ends atomically, accepts once and verifies arrival before completion', () => {
  const x = createSystem();
  const o = x.dispatch.create('operator', { fromHubId: 'hub-a', toHubId: 'hub-b', quantity: 2 });
  const before = x.repo.snapshot().state;
  throws(
    () =>
      x.dispatch.update('operator', o.id, { fromHubId: 'hub-a', toHubId: 'hub-b', quantity: 50 }),
    'InsufficientVehicles',
  );
  assert.deepEqual(x.repo.snapshot().state, before);
  x.dispatch.accept('technician', o.id);
  throws(() => x.dispatch.accept('technician2', o.id), 'AssignmentConflict');
  throws(() => x.dispatch.complete('technician', o.id), 'LocationMismatch');
  o.vehicleIds.forEach((v) => locate(x, v, 'hub-b'));
  x.dispatch.complete('technician', o.id);
  const after = x.repo.snapshot().state;
  x.dispatch.complete('technician', o.id);
  assert.deepEqual(x.repo.snapshot().state, after);
  assertInventory(x);
});
test('five What-if presets preserve live state, inventory/capacity and deterministic results across seeds', () => {
  const x = createSystem();
  const snapshot = x.repo.snapshot();
  const before = x.repo.snapshot().state;
  for (const type of Object.values(ScenarioType))
    for (const seed of [1, 42, 77])
      for (const horizonMinutes of [30, 60, 120]) {
        const parameters = new Map<string, number>(
          type.includes('SURGE')
            ? [['multiplier', 2]]
            : type === 'PORT_FAILURE'
              ? [['failedPorts', 1]]
              : type === 'VEHICLE_IMBALANCE'
                ? [['additionalVehicles', 3]]
                : [],
        );
        const scenario = new Scenario({
          id: 'check',
          creatorId: 'operator',
          type,
          targetHubId: type === 'DEMAND_SURGE' ? 'hub-metro' : 'hub-a',
          parameters,
          horizonMinutes,
          seed,
        });
        const engine = new WhatIfEngine(15000, () => 123);
        const r = engine.simulate(snapshot, scenario);
        assert.deepEqual(engine.simulate(snapshot, scenario), r);
        assert.deepEqual(x.repo.snapshot().state, before);
        assert.equal(r.metrics.get('totalVehicles'), 54);
        assert.equal(r.timeline!.length, horizonMinutes / 5 + 1);
        assert.ok(r.actions!.length <= 3);
        assert.equal(r.scope!.scenarioType, type);
        assert.equal(r.scope!.targetHubId, scenario.targetHubId);
        assert.equal(r.scope!.horizonMinutes, horizonMinutes);
        assert.ok(r.scope!.scenarioUsablePorts <= r.scope!.initialUsablePorts);
        if (type === ScenarioType.PORT_FAILURE)
          assert.equal(r.scope!.scenarioUsablePorts, r.scope!.initialUsablePorts - 1);
        for (const frame of r.timeline!)
          for (const h of frame.hubs) assert.ok(h.occupiedSpaces + h.heldSpaces <= h.capacity);
        for (const a of r.actions!) {
          assert.ok(a.quantity > 0 && a.quantity <= 3);
          assert.ok(a.arrivalMinute > a.departMinute);
        }
        for (const m of Object.values(r.comparison!).filter((v) => typeof v === 'object') as any[])
          assert.equal(m.servedTrips + m.unservedTrips, m.requestedTrips);
      }
});
test('unit demand multiplier matches the baseline; surge uses trip counts instead of static subtraction', () => {
  const x = createSystem();
  const neutral = x.whatIf.run('operator', {
    type: ScenarioType.DEMAND_SURGE,
    targetHubId: 'hub-metro',
    parameters: { multiplier: 1 },
    horizonMinutes: 60,
    seed: 42,
  });
  assert.deepEqual(neutral.comparison!.baseline, neutral.comparison!.scenario);
  const r = x.whatIf.run('operator', {
    type: ScenarioType.DEMAND_SURGE,
    targetHubId: 'hub-metro',
    parameters: { multiplier: 2 },
    horizonMinutes: 60,
    seed: 42,
  });
  assert.ok(r.comparison!.scenario.servedTrips > r.metrics.get('baselineVehicles')!);
  assert.equal(r.scope!.scenarioOutboundRequests, r.scope!.normalOutboundRequests * 2);
  assert.equal(
    r.comparison!.scenario.requestedTrips - r.comparison!.baseline.requestedTrips,
    r.scope!.scenarioOutboundRequests - r.scope!.normalOutboundRequests,
  );
  assert.ok(r.actions!.length > 0);
  assert.ok(r.comparison!.coordinated.servedTrips > r.comparison!.scenario.servedTrips);
});
test('What-if validates roles, supported parameters, intervals and timeout', () => {
  const x = createSystem();
  const data = {
    type: ScenarioType.PORT_FAILURE,
    targetHubId: 'hub-a',
    parameters: { failedPorts: 1 },
    horizonMinutes: 60,
    seed: 42,
  };
  throws(() => x.whatIf.run('customer', data), 'Forbidden');
  throws(() => x.whatIf.run('operator', { ...data, horizonMinutes: 1440 }), 'ValidationError');
  throws(
    () => x.whatIf.run('operator', { ...data, parameters: { unknown: 1 } }),
    'InvalidScenario',
  );
  const scenario = new Scenario({
    id: 'timeout',
    creatorId: 'operator',
    type: ScenarioType.PORT_FAILURE,
    targetHubId: 'hub-a',
    parameters: new Map([['failedPorts', 1]]),
    horizonMinutes: 60,
    seed: 42,
  });
  throws(() => new WhatIfEngine(0).simulate(x.repo.snapshot(), scenario), 'SimulationTimeout');
});

test('operator can cancel its own fleet charge request and release the vehicle for rental', () => {
  const x = createSystem();
  const r = x.charging.request('operator', {
    vehicleId: 'hub-metro-v1',
    hubId: 'hub-metro',
    targetBattery: 80,
  });
  x.reservations.cancel('operator', r.id);
  assert.equal(x.repo.get<any>('reservations', r.id).status, 'CANCELLED');
  assert.ok(hold(x, 'customer', 'hub-metro-v1'));
});
test('simulated failed connector stays faulty after an already stopped session disconnects', () => {
  const x = createSystem();
  x.charging.stop('customer3', 'session-seed-active');
  const snapshot = x.repo.snapshot();
  const scenario = new Scenario({
    id: 'fault-after-stop',
    creatorId: 'operator',
    type: ScenarioType.PORT_FAILURE,
    targetHubId: 'hub-a',
    parameters: new Map([['failedPorts', 1]]),
    horizonMinutes: 60,
    seed: 42,
  });
  const result = new WhatIfEngine().simulate(snapshot, scenario);
  for (const frame of result.timeline!)
    assert.ok(frame.hubs.find((h) => h.hubId === 'hub-a')!.faultPorts >= 2);
  assert.deepEqual(x.repo.snapshot().state, snapshot.state);
});

test('Hub power is the sum of installed ports and never independently blocks a free connector', () => {
  const x = createSystem();
  x.repo.transact((s) => {
    s.hubs.get('hub-metro')!.chargingBudgetKw = 0;
  });
  assert.equal(x.hubs.getDetail('hub-metro').chargingTotalKw, 11);
  assert.equal(x.hubs.getDetail('hub-metro').chargingBudgetKw, 11);
  assert.equal(x.hubs.getDetail('hub-a').chargingTotalKw, 12.1);
  assert.equal(x.hubs.getDetail('hub-a').faultPorts, 1);
  assert.equal(x.hubs.getDetail('hub-a').chargingAvailableKw, 0);
  assert.equal(x.hubs.getDetail('hub-a').chargingActiveKw, 8.8);
  x.charging.request('customer', {
    vehicleId: 'personal-1',
    hubId: 'hub-metro',
    targetBattery: 80,
  });
  x.charging.request('customer6', {
    vehicleId: 'personal-4',
    hubId: 'hub-metro',
    targetBattery: 80,
  });
  for (const n of [1, 2, 3])
    x.charging.request('operator', {
      vehicleId: `hub-metro-v${n}`,
      hubId: 'hub-metro',
      targetBattery: 95,
    });
  assert.equal(x.charging.schedule(x.now()), 4);
  const hub = x.hubs.getDetail('hub-metro');
  assert.equal(hub.chargingUsedKw, 11);
  assert.equal(hub.freePorts, 0);
  const waiting = x.repo
    .list<any>('reservations')
    .filter((r) => r.hubId === 'hub-metro' && r.status === 'WAITING');
  assert.equal(waiting.length, 1);
  assert.match(waiting[0].waitingReason, /cổng trống/);
});

test('charging controls belong to personal owner or fleet technician, never Operator', () => {
  const x = createSystem();
  const initial = x.repo.snapshot().state;
  for (const user of ['operator', 'technician', 'customer2'])
    throws(() => x.charging.stop(user, 'session-seed-active'), 'Forbidden');
  assert.deepEqual(x.repo.snapshot().state, initial);
  const request = x.charging.request('operator', {
    vehicleId: 'hub-metro-v1',
    hubId: 'hub-metro',
    targetBattery: 90,
  });
  x.charging.schedule(x.now());
  throws(() => x.charging.start('operator', request.id), 'Forbidden');
  throws(() => x.charging.start('customer', request.id), 'Forbidden');
  const session = x.charging.start('technician', request.id);
  throws(() => x.charging.stop('operator', session.id), 'Forbidden');
  throws(() => x.charging.disconnect('operator', session.id), 'Forbidden');
  throws(
    () =>
      x.charging.request('technician', {
        vehicleId: 'hub-metro-v2',
        hubId: 'hub-metro',
        targetBattery: 90,
      }),
    'Forbidden',
  );
  x.charging.stop('technician', session.id);
  x.charging.disconnect('technician2', session.id);
  assert.equal(x.repo.get<any>('chargingSessions', session.id).status, 'CANCELLED');
  x.charging.stop('customer3', 'session-seed-active');
  x.charging.disconnect('customer3', 'session-seed-active');
  assertInventory(x);
});
