import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
async function withApi(run: (request: any) => Promise<void>) {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as any;
  const url = `http://127.0.0.1:${address.port}`;
  const request = async (
    path: string,
    method = 'GET',
    body?: unknown,
    token?: string,
    headers = {},
  ) => {
    const res = await fetch(url + '/api' + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json(), headers: res.headers };
  };
  try {
    await run(request);
  } finally {
    server.close();
    await once(server, 'close');
  }
}
test('HTTP auth uses HttpOnly cookie, enforces role and ignores spoofed actor IDs', async () =>
  withApi(async (request: any) => {
    assert.equal((await request('/workspace')).status, 401);
    const login = await request('/auth/login', 'POST', {
      identifier: 'customer@hub.local',
      password: 'Demo@12345',
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
    assert.ok(!JSON.stringify(login.body).includes('passwordHash'));
    const token = login.body.token;
    assert.equal((await request('/network', 'GET', undefined, token)).status, 403);
    assert.equal(
      (
        await request(
          '/dispatch',
          'POST',
          { fromHubId: 'hub-a', toHubId: 'hub-b', quantity: 1, operatorId: 'operator' },
          token,
        )
      ).status,
      403,
    );
    const reserve = await request(
      '/reservations/vehicle',
      'POST',
      { vehicleId: 'hub-a-v1', returnHubId: 'hub-b', userId: 'customer2' },
      token,
    );
    assert.equal(reserve.body.userId, 'customer');
    const ws = await request('/workspace', 'GET', undefined, token);
    assert.ok(!JSON.stringify(ws.body).includes('passwordHash'));
    assert.ok(!ws.body.vehicles.some((v: any) => v.id === 'personal-3'));
    await request('/auth/logout', 'POST', {}, token);
    assert.equal((await request('/workspace', 'GET', undefined, token)).status, 401);
  }));
test('parallel HTTP reservations cannot double-book a shared vehicle', async () =>
  withApi(async (request: any) => {
    const a = (
      await request('/auth/login', 'POST', {
        identifier: 'customer@hub.local',
        password: 'Demo@12345',
      })
    ).body.token;
    const b = (
      await request('/auth/login', 'POST', {
        identifier: 'customer2@hub.local',
        password: 'Demo@12345',
      })
    ).body.token;
    const requests = await Promise.all([
      request('/reservations/vehicle', 'POST', { vehicleId: 'hub-a-v1', returnHubId: 'hub-b' }, a),
      request('/reservations/vehicle', 'POST', { vehicleId: 'hub-a-v1', returnHubId: 'hub-b' }, b),
    ]);
    assert.deepEqual(requests.map((r) => r.status).sort(), [201, 409]);
  }));
test('JSON serialization preserves what-if metrics; bad inputs and cross-origin calls fail', async () =>
  withApi(async (request: any) => {
    const token = (
      await request('/auth/login', 'POST', {
        identifier: 'operator@hub.local',
        password: 'Demo@12345',
      })
    ).body.token;
    const result = await request(
      '/what-if',
      'POST',
      {
        type: 'DEMAND_SURGE',
        targetHubId: 'hub-metro',
        parameters: { requiredVehicles: 8 },
      },
      token,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.metrics.requiredVehicles, 8);
    assert.equal(result.body.metrics.availableVehicles, 4);
    assert.equal(result.body.metrics.shortage, 4);
    assert.equal(result.body.targetHubId, 'hub-metro');
    assert.equal(result.body.type, 'DEMAND_SURGE');
    assert.equal(result.body.timeline, undefined);
    assert.ok(result.body.assessment.calculations.length);
    assert.equal((await request('/demo/advance', 'POST', { seconds: -1 }, token)).status, 400);
    assert.equal(
      (await request('/demo/reset', 'POST', {}, token, { Origin: 'https://untrusted.example' }))
        .status,
      403,
    );
    assert.equal((await request('/hubs?minBattery=banana', 'GET', undefined, token)).status, 400);
    assert.equal(
      (
        await request(
          '/what-if',
          'POST',
          {
            type: 'DEMAND_SURGE',
            targetHubId: 'hub-a',
            parameters: { unknown: 1 },
          },
          token,
        )
      ).status,
      400,
    );
  }));
test('API access to telemetry and device controls is scoped, expired sessions stop working', async () =>
  withApi(async (request: any) => {
    const customer = (
      await request('/auth/login', 'POST', {
        identifier: 'customer@hub.local',
        password: 'Demo@12345',
      })
    ).body.token;
    assert.equal(
      (
        await request(
          '/demo/telemetry',
          'POST',
          { vehicleId: 'personal-3', hubId: 'hub-b' },
          customer,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          '/demo/command',
          'POST',
          { target: { kind: 'VEHICLE', id: 'hub-a-v1' }, command: 'UNLOCK', success: false },
          customer,
        )
      ).status,
      403,
    );
    const op = (
      await request('/auth/login', 'POST', {
        identifier: 'operator@hub.local',
        password: 'Demo@12345',
      })
    ).body.token;
    for (let n = 0; n < 8; n++) await request('/demo/advance', 'POST', { seconds: 3600 }, op);
    assert.equal((await request('/workspace', 'GET', undefined, customer)).status, 401);
  }));

test('HTTP destination booking, personal exit and charging transitions enforce ownership and return coherent state', async () =>
  withApi(async (request: any) => {
    const login = async (identifier: string) =>
      (await request('/auth/login', 'POST', { identifier, password: 'Demo@12345' })).body.token;
    const customer = await login('customer@hub.local');
    const other = await login('customer2@hub.local');
    const operator = await login('operator@hub.local');
    assert.equal(
      (await request('/reservations/vehicle', 'POST', { vehicleId: 'hub-metro-v1' }, customer))
        .status,
      400,
    );
    const booked = await request(
      '/reservations/vehicle',
      'POST',
      { vehicleId: 'hub-metro-v1', returnHubId: 'hub-bk' },
      customer,
    );
    assert.equal(booked.status, 201);
    assert.equal(
      (
        await request(
          `/reservations/${booked.body.id}/destination`,
          'POST',
          { hubId: 'hub-library' },
          other,
        )
      ).status,
      403,
    );
    const changed = await request(
      `/reservations/${booked.body.id}/destination`,
      'POST',
      { hubId: 'hub-library' },
      customer,
    );
    assert.equal(changed.status, 200);
    const pickup = await request(
      '/rentals/pickup',
      'POST',
      { reservationId: booked.body.id, code: booked.body.pickupCode },
      customer,
    );
    assert.equal(pickup.status, 201);
    await request(
      '/demo/telemetry',
      'POST',
      { vehicleId: 'hub-metro-v1', hubId: 'hub-library' },
      customer,
    );
    const returned = await request(
      `/rentals/${pickup.body.id}/return`,
      'POST',
      { hubId: 'hub-library', spaceId: changed.body.plannedReturnSpaceId },
      customer,
    );
    assert.equal(returned.status, 200);
    assert.equal(returned.body.penalty, 0);
    assert.equal((await request('/vehicles/personal-1/checkout', 'POST', {}, other)).status, 403);
    const charge = await request(
      '/charging/requests',
      'POST',
      { vehicleId: 'personal-1', hubId: 'hub-metro', targetBattery: 36 },
      customer,
    );
    assert.equal(charge.status, 201);
    assert.equal(charge.body.status, 'WAITING');
    await request('/workspace', 'GET', undefined, customer);
    const start = await request(`/charging/${charge.body.id}/start`, 'POST', {}, customer);
    assert.equal(start.status, 201);
    assert.equal(
      (await request('/vehicles/personal-1/checkout', 'POST', {}, customer)).status,
      409,
    );
    await request('/demo/advance', 'POST', { seconds: 60 }, operator);
    const ws = (await request('/workspace', 'GET', undefined, customer)).body;
    assert.equal(
      ws.chargingSessions.find((c: any) => c.id === start.body.id).status,
      'AWAITING_DISCONNECT',
    );
    const note = ws.notifications.find((n: any) => n.kind === 'CHARGE_TARGET');
    assert.ok(note);
    assert.equal(
      (await request('/notifications/read', 'POST', { id: note.id }, other)).status,
      403,
    );
    assert.equal(
      (await request('/notifications/read', 'POST', { id: note.id }, customer)).status,
      200,
    );
    assert.equal(
      (await request(`/charging/${start.body.id}/disconnect`, 'POST', {}, other)).status,
      403,
    );
    assert.equal(
      (await request(`/charging/${start.body.id}/disconnect`, 'POST', {}, customer)).status,
      200,
    );
    assert.equal(
      (await request('/vehicles/personal-1/checkout', 'POST', {}, customer)).status,
      200,
    );
    const final = (await request('/workspace', 'GET', undefined, customer)).body;
    assert.equal(final.vehicles.find((v: any) => v.id === 'personal-1').parkingSpaceId, undefined);
    assert.ok(final.parkingVisits.some((v: any) => v.vehicleId === 'personal-1' && v.exitedAt));
  }));

test('HTTP charging monitoring, global queue ranks and fleet technician permissions are consistent', async () =>
  withApi(async (request: any) => {
    const login = async (name: string) =>
      (
        await request('/auth/login', 'POST', {
          identifier: name + '@hub.local',
          password: 'Demo@12345',
        })
      ).body.token;
    const op = await login('operator');
    const tech = await login('technician');
    const customer = await login('customer4');
    const ws = (await request('/workspace', 'GET', undefined, op)).body;
    const a = ws.hubs.find((h: any) => h.id === 'hub-a');
    assert.equal(a.chargingTotalKw, 12.1);
    assert.equal(a.chargingActiveKw, 8.8);
    assert.equal(a.freePorts, 0);
    assert.equal(a.activePorts, 3);
    const mine = (await request('/workspace', 'GET', undefined, customer)).body;
    assert.equal(
      mine.reservations.find((r: any) => r.id === 'charge-seed-wait-1').queuePosition,
      2,
    );
    assert.ok(mine.reservations.every((r: any) => r.userId === 'customer4'));
    const fleet = (await request('/workspace', 'GET', undefined, tech)).body;
    assert.equal(fleet.chargingSessions.length, 2);
    assert.ok(fleet.chargingSessions.every((c: any) => c.vehicleId.startsWith('hub-')));
    assert.ok(!fleet.reservations.some((r: any) => r.id === 'charge-seed-active'));
    assert.ok(ws.reservations.find((r: any) => r.id === 'charge-seed-active').requesterName);
    for (const token of [op, tech, customer])
      assert.equal(
        (await request('/charging/session-seed-active/stop', 'POST', {}, token)).status,
        403,
      );
    assert.equal(
      (await request('/charging/session-seed-fleet-1/stop', 'POST', {}, op)).status,
      403,
    );
    assert.equal(
      (await request('/charging/session-seed-fleet-1/stop', 'POST', {}, tech)).status,
      200,
    );
    assert.equal(
      (await request('/charging/session-seed-fleet-1/disconnect', 'POST', {}, op)).status,
      403,
    );
    assert.equal(
      (await request('/charging/session-seed-fleet-1/disconnect', 'POST', {}, tech)).status,
      200,
    );
    const updated = (await request('/workspace', 'GET', undefined, op)).body;
    assert.equal(
      updated.reservations.find((r: any) => r.id === 'charge-seed-wait-2').status,
      'HELD',
    );
    assert.equal(
      updated.reservations.find((r: any) => r.id === 'charge-seed-wait-1').status,
      'WAITING',
    );
    const newFleet = await request(
      '/charging/requests',
      'POST',
      { vehicleId: 'hub-metro-v1', hubId: 'hub-metro', targetBattery: 80 },
      op,
    );
    assert.equal(newFleet.status, 201);
    await request('/workspace', 'GET', undefined, op);
    assert.equal(
      (await request(`/charging/${newFleet.body.id}/start`, 'POST', {}, op)).status,
      403,
    );
    assert.equal(
      (await request(`/charging/${newFleet.body.id}/start`, 'POST', {}, customer)).status,
      403,
    );
    assert.equal(
      (await request(`/charging/${newFleet.body.id}/start`, 'POST', {}, tech)).status,
      201,
    );
  }));

test('HTTP static assessment and trial share saved inputs and leave operations intact', async () =>
  withApi(async (request: any) => {
    const login = async (name: string) =>
      (
        await request('/auth/login', 'POST', {
          identifier: name + '@hub.local',
          password: 'Demo@12345',
        })
      ).body.token;
    const op = await login('operator');
    const customer = await login('customer');
    const demand = {
      type: 'DEMAND_SURGE',
      targetHubId: 'hub-metro',
      parameters: { requiredVehicles: 8 },
    };
    const impact = await request('/what-if', 'POST', demand, op);
    assert.equal(impact.status, 200);
    const r = impact.body;
    assert.equal(r.proposals.length, 1);
    assert.equal(r.proposals[0].actions[0].quantity, 4);
    assert.equal(r.comparison, undefined);
    assert.equal(
      (await request('/what-if/trial', 'POST', { scenarioId: r.scenarioId }, customer)).status,
      403,
    );
    assert.equal((await request('/what-if/trial', 'POST', {}, op)).status, 400);
    assert.equal(
      (await request('/what-if/trial', 'POST', { scenarioId: 'missing' }, op)).status,
      404,
    );
    assert.equal(
      (
        await request(
          '/what-if/trial',
          'POST',
          { scenarioId: r.scenarioId, proposalId: 'injected' },
          op,
        )
      ).status,
      400,
    );
    for (const legacy of [{ horizonMinutes: 60 }, { seed: 42 }])
      assert.equal((await request('/what-if', 'POST', { ...demand, ...legacy }, op)).status, 400);
    const booking = await request(
      '/reservations/vehicle',
      'POST',
      {
        vehicleId: 'hub-a-v1',
        returnHubId: 'hub-b',
      },
      customer,
    );
    assert.equal(booking.status, 201);
    const live = (await request('/workspace', 'GET', undefined, op)).body;
    const trial = await request(
      '/what-if/trial',
      'POST',
      {
        scenarioId: r.scenarioId,
        proposalId: r.proposals[0].id,
        actions: [{ type: 'RELOCATE', quantity: 999 }],
      },
      op,
    );
    assert.equal(trial.status, 200);
    assert.deepEqual(trial.body.before, r.assessment);
    assert.deepEqual(trial.body.proposal, r.proposals[0]);
    assert.equal(trial.body.after.metrics.find((m: any) => m.key === 'shortage').value, 0);
    const current = (await request('/workspace', 'GET', undefined, op)).body;
    for (const key of ['dispatchOrders', 'spaces', 'reservations', 'ports', 'incidents'])
      assert.deepEqual(current[key], live[key]);
    // GET /workspace runs the charging clock; compare session identity and state without its tick timestamp.
    const stableSessions = (sessions: any[]) =>
      sessions.map(({ updatedAt, ...session }) => session);
    assert.deepEqual(
      stableSessions(current.chargingSessions),
      stableSessions(live.chargingSessions),
    );
    assert.equal(current.reservations.find((v: any) => v.id === booking.body.id).status, 'HELD');
    for (const portId of ['hub-a-c1', 'hub-a-c4']) {
      const fault = await request(
        '/what-if',
        'POST',
        {
          type: 'PORT_FAILURE',
          targetHubId: 'hub-a',
          parameters: { portId },
        },
        op,
      );
      assert.equal(fault.status, 200);
      const proposal = fault.body.proposals.find((p: any) => p.id === 'recover:' + portId);
      assert.ok(proposal);
      const repair = await request(
        '/what-if/trial',
        'POST',
        {
          scenarioId: fault.body.scenarioId,
          proposalId: proposal.id,
        },
        op,
      );
      assert.equal(repair.status, 200);
      const metric = (key: string) =>
        repair.body.after.metrics.find((m: any) => m.key === key)?.value;
      assert.equal(metric('affectedSessions'), 0);
      assert.equal(metric('assignedByPlan'), portId === 'hub-a-c4' ? 1 : 0);
    }
    assert.equal(
      (
        await request(
          '/what-if',
          'POST',
          {
            type: 'PORT_FAILURE',
            targetHubId: 'hub-metro',
            parameters: { portId: 'hub-a-c4' },
          },
          op,
        )
      ).status,
      400,
    );
    const noPlan = await request(
      '/what-if',
      'POST',
      {
        ...demand,
        parameters: { requiredVehicles: 1 },
      },
      op,
    );
    assert.equal(noPlan.body.proposals.length, 0);
    assert.equal(
      (await request('/what-if/trial', 'POST', { scenarioId: noPlan.body.scenarioId }, op)).status,
      409,
    );
    assert.equal(
      current.hubs.find((h: any) => h.id === 'hub-bk').travelMinutesTo['hub-library'],
      5,
    );
  }));
