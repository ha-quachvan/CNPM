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
test('hub search/detail and operator network query share current inventory', () => {
  const x = createSystem();
  assert.equal(
    x.hubs.search({ area: 'Ký túc', vehicleType: 'E_BIKE' as any, minBattery: 50 }).length,
    2,
  );
  assert.equal(x.hubs.search({ area: 'No such hub' }).length, 0);
  const before = x.hubs.getDetail('hub-a').availableVehicles;
  x.reservations.reserveVehicle('customer', 'hub-a-v1');
  assert.equal(x.hubs.getDetail('hub-a').availableVehicles, before - 1);
  throws(() => x.hubs.getNetworkStatus('customer'), 'Forbidden');
  assert.equal(x.hubs.getNetworkStatus('operator').hubs.length, 4);
});
test('competing vehicle holds grant only one and expiry leaves occupied parking intact', () => {
  const x = createSystem();
  const r = x.reservations.reserveVehicle('customer', 'hub-a-v1');
  throws(() => x.reservations.reserveVehicle('customer2', 'hub-a-v1'), 'ResourceConflict');
  assert.equal(x.repo.list('reservations').length, 1);
  x.advance(901);
  assert.equal(x.repo.get<any>('reservations', r.id).status, 'EXPIRED');
  assert.equal(x.repo.get<any>('vehicles', 'hub-a-v1').status, 'AVAILABLE');
  assert.equal(x.repo.get<any>('spaces', 'hub-a-p1').status, 'OCCUPIED');
  assert.equal(x.reservations.expire(x.now()), 0);
});
test('vehicle resource change rolls back on conflict and cancel releases only its own hold', () => {
  const x = createSystem();
  const r = x.reservations.reserveVehicle('customer', 'hub-a-v1');
  x.reservations.reserveVehicle('customer2', 'hub-a-v2');
  throws(() => x.reservations.changeResource('customer', r.id, 'hub-a-v2'), 'ResourceConflict');
  assert.equal(x.repo.get<any>('vehicles', 'hub-a-v1').status, 'RESERVED');
  x.reservations.changeResource('customer', r.id, 'hub-a-v3');
  assert.equal(x.repo.get<any>('vehicles', 'hub-a-v1').status, 'AVAILABLE');
  assert.equal(x.repo.get<any>('vehicles', 'hub-a-v3').status, 'RESERVED');
  throws(() => x.reservations.cancel('customer2', r.id), 'Forbidden');
  x.reservations.cancel('customer', r.id);
  assert.equal(x.repo.get<any>('vehicles', 'hub-a-v3').status, 'AVAILABLE');
});
test('personal parking validates owner, permits extension/change then confirms occupancy', () => {
  const x = createSystem();
  throws(
    () =>
      x.reservations.reserveParking('customer2', {
        vehicleId: 'personal-2',
        hubId: 'hub-b',
        spaceId: 'hub-b-p5',
      }),
    'Forbidden',
  );
  const r = x.reservations.reserveParking('customer', {
    vehicleId: 'personal-2',
    hubId: 'hub-b',
    spaceId: 'hub-b-p5',
  });
  assert.equal(x.reservations.extend('customer', r.id, 5).extensionCount, 1);
  x.reservations.changeResource('customer', r.id, 'hub-b-p6');
  assert.equal(x.repo.get<any>('spaces', 'hub-b-p5').status, 'FREE');
  x.reservations.confirmParking('customer', r.id);
  assert.equal(x.repo.get<any>('spaces', 'hub-b-p6').vehicleId, 'personal-2');
  assert.equal(x.repo.get<any>('reservations', r.id).status, 'COMPLETED');
  throws(() => x.reservations.cancel('customer', r.id), 'InvalidReservationState');
});
test('pickup handles wrong code and device failure atomically, then return is idempotent', () => {
  const x = createSystem();
  const r = x.reservations.reserveVehicle('customer', 'hub-a-v1');
  throws(() => x.rental.pickup('customer', r.id, '000000'), 'InvalidPickupCode');
  x.simulator.setCommandResult({ kind: 'VEHICLE', id: r.vehicleId }, DeviceCommand.UNLOCK, false);
  throws(() => x.rental.pickup('customer', r.id, r.pickupCode), 'DeviceFailure');
  assert.equal(x.repo.list('rentals').length, 0);
  assert.equal(x.repo.get<any>('spaces', 'hub-a-p1').status, 'OCCUPIED');
  x.simulator.setCommandResult({ kind: 'VEHICLE', id: r.vehicleId }, DeviceCommand.UNLOCK, true);
  const rental = x.rental.pickup('customer', r.id, r.pickupCode);
  assert.equal(x.repo.get<any>('spaces', 'hub-a-p1').status, 'FREE');
  throws(
    () => x.rental.returnVehicle('customer2', rental.id, { hubId: 'hub-b', spaceId: 'hub-b-p5' }),
    'Forbidden',
  );
  throws(
    () => x.rental.returnVehicle('customer', rental.id, { hubId: 'hub-b', spaceId: 'hub-b-p5' }),
    'ParkingConflict',
  );
  assert.equal(x.repo.get<any>('rentals', rental.id).status, 'ACTIVE');
  x.simulator.setTelemetry(r.vehicleId, {
    position: { lat: 10, lng: 106, hubId: 'hub-b' },
    batteryLevel: 45,
    locked: false,
  });
  const result = x.rental.returnVehicle('customer', rental.id, {
    hubId: 'hub-b',
    spaceId: 'hub-b-p5',
  });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.penalty, 30000);
  const state = x.repo.snapshot().state;
  assert.deepEqual(
    x.rental.returnVehicle('customer', rental.id, { hubId: 'hub-b', spaceId: 'hub-b-p5' }),
    result,
  );
  assert.deepEqual(x.repo.snapshot().state, state);
});
test('charging waits without a port, schedules with power budget, starts and finishes safely', () => {
  const x = createSystem();
  const r = x.charging.request('customer', {
    vehicleId: 'personal-1',
    hubId: 'hub-a',
    targetBattery: 80,
  });
  assert.equal(r.status, 'WAITING');
  assert.equal(x.repo.get<any>('ports', 'hub-a-c1').status, 'FREE');
  assert.equal(x.charging.schedule(x.now()), 1);
  const c = x.charging.start('customer', r.id);
  assert.equal(x.repo.get<any>('reservations', r.id).status, 'CONFIRMED');
  x.reservations.expire(x.now() + 16 * 60000);
  assert.equal(x.repo.get<any>('ports', c.portId).status, 'CHARGING');
  x.charging.advance(c.updatedAt + 3600000);
  assert.equal(x.repo.get<Vehicle>('vehicles', c.vehicleId)!.batteryLevel, 80);
  assert.equal(x.repo.get<any>('reservations', r.id).status, 'COMPLETED');
  assert.equal(x.repo.get<any>('ports', c.portId).status, 'FREE');
  assert.equal(x.charging.advance(c.updatedAt + 3600000), 0);
});
test('charging allocation respects power budget, owner and no duplicate active requests', () => {
  const x = createSystem();
  x.repo.transact((s) => {
    s.hubs.get('hub-a')!.chargingBudgetKw = 2.2;
    const v = structuredClone(s.vehicles.get('personal-1')!);
    v.id = 'personal-extra';
    v.ownerId = 'customer2';
    v.parkingSpaceId = 'hub-a-p7';
    s.vehicles.set(v.id, v);
    Object.assign(s.spaces.get(v.parkingSpaceId)!, { vehicleId: v.id, status: 'OCCUPIED' });
  });
  throws(
    () =>
      x.charging.request('customer2', {
        vehicleId: 'personal-1',
        hubId: 'hub-a',
        targetBattery: 90,
      }),
    'Forbidden',
  );
  x.charging.request('customer', {
    vehicleId: 'personal-1',
    hubId: 'hub-a',
    portId: 'hub-a-c1',
    targetBattery: 90,
  });
  throws(
    () =>
      x.charging.request('customer', {
        vehicleId: 'personal-1',
        hubId: 'hub-a',
        targetBattery: 90,
      }),
    'ResourceConflict',
  );
  const wait = x.charging.request('customer2', {
    vehicleId: 'personal-extra',
    hubId: 'hub-a',
    targetBattery: 90,
  });
  assert.equal(x.charging.schedule(x.now()), 0);
  assert.equal(x.repo.get<any>('reservations', wait.id).portId, undefined);
});
test('incident ownership and competing assignment, failed checks preserve ASSIGNED', () => {
  const x = createSystem();
  const i = x.incidents.report('customer', {
    target: { kind: 'VEHICLE', id: 'hub-a-v1' },
    description: 'Cần kiểm tra khóa',
  });
  assert.equal(x.repo.get<any>('vehicles', 'hub-a-v1').status, 'MAINTENANCE');
  assert.ok(!x.incidents.list('customer2', {}).some((v) => v.id === i.id));
  x.incidents.accept('technician', i.id);
  throws(() => x.incidents.accept('technician2', i.id), 'AssignmentConflict');
  throws(() => x.incidents.resolve('technician2', i.id, 'Đã sửa'), 'Forbidden');
  x.simulator.setCommandResult(i.target, DeviceCommand.CHECK, false);
  throws(() => x.incidents.resolve('technician', i.id, 'Đã kiểm tra'), 'DeviceFailure');
  assert.equal(x.repo.get<any>('incidents', i.id).status, 'ASSIGNED');
  x.simulator.setCommandResult(i.target, DeviceCommand.CHECK, true);
  x.incidents.resolve('technician', i.id, 'Đã xử lý khóa');
  assert.equal(x.repo.get<any>('vehicles', 'hub-a-v1').status, 'AVAILABLE');
});
test('resolving an incident on rented vehicle does not release its rental', () => {
  const x = createSystem();
  const r = x.reservations.reserveVehicle('customer', 'hub-a-v1');
  const rental = x.rental.pickup('customer', r.id, r.pickupCode);
  const i = x.incidents.report('customer', {
    target: { kind: 'VEHICLE', id: r.vehicleId },
    description: 'Kiểm tra xe',
  });
  x.incidents.accept('technician', i.id);
  x.incidents.resolve('technician', i.id, 'Đã kiểm tra');
  assert.equal(x.repo.get<any>('vehicles', r.vehicleId).status, 'IN_USE');
  assert.equal(x.repo.get<Rental>('rentals', rental.id)!.status, 'ACTIVE');
});
test('dispatch creates source and destination holds atomically; update failure preserves previous holds', () => {
  const x = createSystem();
  throws(
    () => x.dispatch.create('customer', { fromHubId: 'hub-a', toHubId: 'hub-b', quantity: 1 }),
    'Forbidden',
  );
  const o = x.dispatch.create('operator', { fromHubId: 'hub-a', toHubId: 'hub-b', quantity: 2 });
  assert.equal(x.repo.snapshot().state.dispatchSpaceHolds.size, 2);
  assert.equal(x.dispatch.getDetail('operator', o.id).vehicleIds.length, 2);
  const before = x.repo.snapshot().state;
  throws(
    () =>
      x.dispatch.update('operator', o.id, { fromHubId: 'hub-a', toHubId: 'hub-b', quantity: 20 }),
    'InsufficientVehicles',
  );
  assert.deepEqual(x.repo.snapshot().state, before);
  const changed = x.dispatch.update('operator', o.id, {
    fromHubId: 'hub-a',
    toHubId: 'hub-bk',
    quantity: 1,
  });
  assert.equal(changed.reservedSpaceIds.length, 1);
  x.dispatch.cancel('operator', o.id);
  assert.equal(x.repo.snapshot().state.dispatchSpaceHolds.size, 0);
  assert.equal(x.repo.get<any>('dispatchOrders', o.id).status, 'CANCELLED');
});
test('dispatch acceptance/completion verifies assigned technician, location and idempotency', () => {
  const x = createSystem();
  const o = x.dispatch.create('operator', { fromHubId: 'hub-a', toHubId: 'hub-b', quantity: 2 });
  x.dispatch.accept('technician', o.id);
  throws(() => x.dispatch.accept('technician2', o.id), 'AssignmentConflict');
  assert.equal(x.dispatch.list('technician2', {}).length, 0);
  throws(() => x.dispatch.cancel('operator', o.id), 'InvalidOrderState');
  throws(() => x.dispatch.complete('technician2', o.id), 'Forbidden');
  throws(() => x.dispatch.complete('technician', o.id), 'LocationMismatch');
  for (const vid of o.vehicleIds)
    x.simulator.setTelemetry(vid, {
      position: { lat: 10, lng: 106, hubId: 'hub-b' },
      batteryLevel: 60,
      locked: true,
    });
  const result = x.dispatch.complete('technician', o.id);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(x.repo.snapshot().state.dispatchSpaceHolds.size, 0);
  const before = x.repo.snapshot().state;
  x.dispatch.complete('technician', o.id);
  assert.deepEqual(x.repo.snapshot().state, before);
  o.vehicleIds.forEach((v) =>
    assert.equal(x.repo.get<Vehicle>('vehicles', v)!.currentHubId, 'hub-b'),
  );
});
test('what-if validates role, all five scenarios, determinism and live-state isolation', () => {
  const x = createSystem();
  const data = {
    type: ScenarioType.DEMAND_SURGE,
    targetHubId: 'hub-a',
    parameters: { multiplier: 2 },
    horizonMinutes: 60,
    seed: 42,
  };
  throws(() => x.whatIf.run('customer', data), 'Forbidden');
  const before = x.repo.snapshot().state;
  const first = x.whatIf.run('operator', data);
  const again = x.whatIf.run('operator', data);
  assert.deepEqual(first.metrics, again.metrics);
  assert.deepEqual(first.recommendations, again.recommendations);
  for (const type of Object.values(ScenarioType))
    assert.ok(x.whatIf.run('operator', { ...data, type }).metrics.size > 0);
  assert.deepEqual(x.repo.snapshot().state, before);
  throws(
    () => x.whatIf.run('operator', { ...data, parameters: { multiplier: NaN } }),
    'ValidationError',
  );
  const engine = new WhatIfEngine(0);
  throws(
    () =>
      engine.simulate(
        x.repo.snapshot(),
        new Scenario({
          id: 's',
          type: ScenarioType.DEMAND_SURGE,
          targetHubId: 'hub-a',
          parameters: new Map(),
          horizonMinutes: 60,
          seed: 1,
        }),
      ),
    'SimulationTimeout',
  );
  assert.deepEqual(x.repo.snapshot().state, before);
});
test('BackgroundJobs advances sessions, expires holds and schedules the waiting queue', () => {
  const x = createSystem();
  const r = x.reservations.reserveVehicle('customer2', 'hub-b-v1');
  const charge = x.charging.request('customer', {
    vehicleId: 'personal-1',
    hubId: 'hub-a',
    targetBattery: 60,
  });
  x.jobs.tick(x.now());
  assert.equal(x.repo.get<any>('reservations', charge.id).status, 'HELD');
  x.charging.start('customer', charge.id);
  x.advance(1800);
  assert.equal(x.repo.get<any>('reservations', r.id).status, 'EXPIRED');
  assert.equal(x.repo.list<ChargingSession>('chargingSessions')[0].status, 'COMPLETED');
});

test('a faulty port with a live hold still reserves its power budget', () => {
  const x = createSystem();
  x.repo.transact((s) => {
    s.hubs.get('hub-a')!.chargingBudgetKw = 3.3;
    const v = structuredClone(s.vehicles.get('personal-1')!);
    v.id = 'extra';
    v.ownerId = 'customer2';
    v.parkingSpaceId = 'hub-a-p7';
    s.vehicles.set(v.id, v);
    Object.assign(s.spaces.get(v.parkingSpaceId)!, { vehicleId: v.id, status: 'OCCUPIED' });
  });
  const hold = x.charging.request('customer', {
    vehicleId: 'personal-1',
    hubId: 'hub-a',
    portId: 'hub-a-c1',
    targetBattery: 80,
  });
  x.incidents.report('customer', {
    target: { kind: 'CHARGING_PORT', id: 'hub-a-c1' },
    description: 'Kiểm tra cổng đang giữ',
  });
  x.charging.request('customer2', { vehicleId: 'extra', hubId: 'hub-a', targetBattery: 90 });
  assert.equal(x.charging.schedule(x.now()), 0);
  assert.equal(x.repo.get<any>('reservations', hold.id).status, 'HELD');
});
test('earliest requiredBy then lower battery wins scarce charging power', () => {
  const x = createSystem();
  x.repo.transact((s) => {
    s.hubs.get('hub-a')!.chargingBudgetKw = 2.2;
    const v = structuredClone(s.vehicles.get('personal-1')!);
    v.id = 'urgent';
    v.ownerId = 'customer2';
    v.batteryLevel = 50;
    v.parkingSpaceId = 'hub-a-p7';
    s.vehicles.set(v.id, v);
    Object.assign(s.spaces.get(v.parkingSpaceId)!, { vehicleId: v.id, status: 'OCCUPIED' });
  });
  const later = x.charging.request('customer', {
    vehicleId: 'personal-1',
    hubId: 'hub-a',
    targetBattery: 90,
    requiredBy: x.now() + 120 * 60000,
  });
  const earlier = x.charging.request('customer2', {
    vehicleId: 'urgent',
    hubId: 'hub-a',
    targetBattery: 90,
    requiredBy: x.now() + 30 * 60000,
  });
  assert.equal(x.charging.schedule(x.now()), 1);
  assert.equal(x.repo.get<any>('reservations', earlier.id).status, 'HELD');
  assert.equal(x.repo.get<any>('reservations', later.id).status, 'WAITING');
});
test('insufficient destination capacity rejects dispatch without retaining any source vehicles', () => {
  const x = createSystem();
  x.repo.transact((s) => {
    for (const p of s.spaces.values())
      if (p.hubId === 'hub-b' && p.status === 'FREE') p.status = 'MAINTENANCE' as any;
  });
  const before = x.repo.snapshot().state;
  throws(
    () => x.dispatch.create('operator', { fromHubId: 'hub-a', toHubId: 'hub-b', quantity: 2 }),
    'InsufficientCapacity',
  );
  assert.deepEqual(x.repo.snapshot().state, before);
});
