import { Router, type Request, type Response } from 'express';
import { authenticate, tokenOf } from '../middleware/auth.js';
import { createSystem, type AppContext } from '../system.js';
import { demoAccounts } from '../data/seed.js';
import { config } from '../shared/config.js';
import { ensure, must, numeric, text } from '../shared/errors.js';
import { actor, freeVehicle } from '../shared/business.js';
import { publicUser } from '../shared/security.js';
import { chargingPriority } from '../shared/scheduling.js';
import {
  Role,
  DeviceCommand,
  VehicleOwnership,
  RentalStatus,
  DispatchStatus,
  HubStatus,
  ReservationKind,
  ReservationStatus,
} from '../models/enums.js';
import type { HubSearchDTO, IncidentFilterDTO, DispatchFilterDTO } from '../models/types.js';
import type { ChargingReservation } from '../models/entities.js';
function query(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) {
    ensure(typeof v === 'string', 'ValidationError', 'Bộ lọc không hợp lệ.', 400);
    out[k] = v;
  }
  return out;
}
export function apiController(context: AppContext): Router {
  const api = Router();
  const who = (res: Response) => res.locals.user.id as string;
  const login = (req: Request, res: Response, provider = false) => {
    const dto = provider
      ? context.current.account.loginWithProvider(req.body.token)
      : context.current.account.login(req.body.identifier, req.body.password);
    res.cookie('hub_session', dto.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
      path: '/',
      maxAge: config.sessionHours * 3600000,
    });
    res.json(dto);
  };
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.get('/auth/demo-accounts', (_req, res) =>
    res.json({
      accounts: demoAccounts.map(({ id, fullName, email, role }) => ({
        id,
        fullName,
        email,
        role,
      })),
      password: 'Demo@12345',
    }),
  );
  api.post('/auth/register', (req, res) =>
    res.status(201).json(context.current.account.register(req.body)),
  );
  api.post('/auth/login', (req, res) => login(req, res));
  api.post('/auth/provider', (req, res) => login(req, res, true));
  api.post('/auth/password-reset/request', (req, res) =>
    res.json(context.current.account.requestPasswordReset(req.body.identifier)),
  );
  api.post('/auth/password-reset', (req, res) => {
    context.current.account.resetPassword(req.body);
    res.clearCookie('hub_session', { path: '/' });
    res.json({ ok: true });
  });
  api.post('/auth/logout', (req, res) => {
    context.current.account.logout(tokenOf(req));
    res.clearCookie('hub_session', { path: '/' });
    res.json({ ok: true });
  });
  api.use(authenticate(context));
  api.get('/me', (_req, res) => res.json(context.current.account.getProfile(who(res))));
  api.patch('/me', (req, res) =>
    res.json(context.current.account.updateProfile(who(res), req.body)),
  );
  api.get('/hubs', (req, res) => {
    const q = query(req);
    const c = {
      ...q,
      minBattery: q.minBattery === undefined ? undefined : Number(q.minBattery),
      needsParking: q.needsParking === 'true',
      needsCharging: q.needsCharging === 'true',
      routeHubIds: q.routeHubIds?.split(','),
    } as HubSearchDTO;
    res.json(context.current.hubs.search(c));
  });
  api.get('/hubs/:id', (req, res) =>
    res.json(context.current.hubs.getDetail(String(req.params.id))),
  );
  api.get('/network', (_req, res) => res.json(context.current.hubs.getNetworkStatus(who(res))));
  api.get('/workspace', (_req, res) => {
    const x = context.current;
    x.jobs.tick(x.now());
    const s = x.repo.snapshot().state;
    const u = res.locals.user;
    const positions = new Map<string, number>();
    const ranks = new Map<string, number>();
    [...s.reservations.values()]
      .filter(
        (r): r is ChargingReservation =>
          r.kind === ReservationKind.CHARGING && r.status === ReservationStatus.WAITING,
      )
      .sort((a, b) => chargingPriority(a, b, s.vehicles))
      .forEach((r) => {
        const rank = (ranks.get(r.hubId) ?? 0) + 1;
        ranks.set(r.hubId, rank);
        positions.set(r.id, rank);
      });
    const reservations = [...s.reservations.values()].filter(
      (r) =>
        u.role === Role.OPERATOR ||
        r.userId === u.id ||
        (u.role === Role.TECHNICIAN &&
          r.kind === ReservationKind.CHARGING &&
          s.vehicles.get(r.vehicleId)?.ownership === VehicleOwnership.SHARED),
    );
    const reservationIds = new Set(reservations.map((r) => r.id));
    res.json({
      user: publicUser(u),
      hubs: x.hubs.search({}),
      vehicles: [...s.vehicles.values()]
        .filter(
          (v) =>
            u.role !== Role.CUSTOMER ||
            v.ownership === VehicleOwnership.SHARED ||
            v.ownerId === u.id,
        )
        .map((v) => ({
          ...v,
          rentable: s.hubs.get(v.currentHubId!)?.status === HubStatus.ACTIVE && freeVehicle(s, v),
        })),
      spaces: [...s.spaces.values()],
      ports: [...s.ports.values()],
      reservations: reservations.map((r) => ({
        ...r,
        requesterName: s.users.get(r.userId)?.fullName || r.userId,
        queuePosition: positions.get(r.id),
      })),
      rentals: [...s.rentals.values()].filter((r) => u.role === Role.OPERATOR || r.userId === u.id),
      chargingSessions: [...s.chargingSessions.values()].filter(
        (c) => u.role === Role.OPERATOR || reservationIds.has(c.reservationId),
      ),
      parkingVisits: [...s.parkingVisits.values()].filter(
        (v) => u.role === Role.OPERATOR || v.userId === u.id,
      ),
      notifications: [...s.notifications.values()]
        .filter((n) => n.userId === u.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 100),
      incidents: x.incidents.list(u.id, {}),
      dispatchOrders: u.role === Role.CUSTOMER ? [] : x.dispatch.list(u.id, {}),
      serverNow: x.now(),
      policy: config,
      team: [...s.users.values()].filter((v) => v.role !== Role.CUSTOMER).map(publicUser),
    });
  });
  api.post('/reservations/vehicle', (req, res) =>
    res
      .status(201)
      .json(
        context.current.reservations.reserveVehicle(
          who(res),
          req.body.vehicleId,
          req.body.returnHubId,
        ),
      ),
  );
  api.post('/reservations/parking', (req, res) =>
    res.status(201).json(context.current.reservations.reserveParking(who(res), req.body)),
  );
  api.delete('/reservations/:id', (req, res) => {
    context.current.reservations.cancel(who(res), String(req.params.id));
    res.json({ ok: true });
  });
  api.post('/reservations/:id/extend', (req, res) =>
    res.json(
      context.current.reservations.extend(who(res), String(req.params.id), req.body.extraMinutes),
    ),
  );
  api.post('/reservations/:id/resource', (req, res) =>
    res.json(
      context.current.reservations.changeResource(
        who(res),
        String(req.params.id),
        req.body.newResourceId,
      ),
    ),
  );
  api.post('/reservations/:id/confirm-parking', (req, res) =>
    res.json(context.current.reservations.confirmParking(who(res), String(req.params.id))),
  );
  api.post('/reservations/:id/destination', (req, res) =>
    res.json(
      context.current.reservations.changeDestination(
        who(res),
        String(req.params.id),
        req.body.hubId,
      ),
    ),
  );
  api.post('/vehicles/:id/checkout', (req, res) =>
    res.json(context.current.reservations.checkoutParking(who(res), String(req.params.id))),
  );
  api.post('/notifications/read', (req, res) => {
    const userId = who(res);
    context.current.repo.transact((s) => {
      if (req.body.id) {
        const n = must(s.notifications, text(req.body.id, 'Thông báo'));
        ensure(n.userId === userId, 'Forbidden', 'Thông báo không thuộc tài khoản này.', 403);
        n.readAt ??= context.current.now();
      } else
        for (const n of s.notifications.values())
          if (n.userId === userId) n.readAt ??= context.current.now();
    });
    res.json({ ok: true });
  });
  api.post('/rentals/pickup', (req, res) =>
    res
      .status(201)
      .json(context.current.rental.pickup(who(res), req.body.reservationId, req.body.code)),
  );
  api.post('/rentals/:id/return', (req, res) =>
    res.json(context.current.rental.returnVehicle(who(res), String(req.params.id), req.body)),
  );
  api.post('/charging/requests', (req, res) =>
    res.status(201).json(context.current.charging.request(who(res), req.body)),
  );
  api.post('/charging/:id/start', (req, res) =>
    res.status(201).json(context.current.charging.start(who(res), String(req.params.id))),
  );
  api.post('/charging/:id/stop', (req, res) =>
    res.json(context.current.charging.stop(who(res), String(req.params.id))),
  );
  api.post('/charging/:id/disconnect', (req, res) =>
    res.json(context.current.charging.disconnect(who(res), String(req.params.id))),
  );
  api.get('/incidents', (req, res) =>
    res.json(context.current.incidents.list(who(res), query(req) as IncidentFilterDTO)),
  );
  api.post('/incidents', (req, res) =>
    res.status(201).json(context.current.incidents.report(who(res), req.body)),
  );
  api.post('/incidents/:id/accept', (req, res) =>
    res.json(context.current.incidents.accept(who(res), String(req.params.id))),
  );
  api.post('/incidents/:id/resolve', (req, res) =>
    res.json(context.current.incidents.resolve(who(res), String(req.params.id), req.body.notes)),
  );
  api.get('/dispatch', (req, res) => {
    const q = query(req);
    res.json(
      context.current.dispatch.list(who(res), {
        ...q,
        from: q.from ? Number(q.from) : undefined,
        to: q.to ? Number(q.to) : undefined,
      } as DispatchFilterDTO),
    );
  });
  api.get('/dispatch/:id', (req, res) =>
    res.json(context.current.dispatch.getDetail(who(res), String(req.params.id))),
  );
  api.post('/dispatch', (req, res) =>
    res.status(201).json(context.current.dispatch.create(who(res), req.body)),
  );
  api.patch('/dispatch/:id', (req, res) =>
    res.json(context.current.dispatch.update(who(res), String(req.params.id), req.body)),
  );
  api.delete('/dispatch/:id', (req, res) => {
    context.current.dispatch.cancel(who(res), String(req.params.id));
    res.json({ ok: true });
  });
  api.post('/dispatch/:id/accept', (req, res) =>
    res.json(context.current.dispatch.accept(who(res), String(req.params.id))),
  );
  api.post('/dispatch/:id/complete', (req, res) =>
    res.json(context.current.dispatch.complete(who(res), String(req.params.id))),
  );
  api.post('/what-if', (req, res) => res.json(context.current.whatIf.run(who(res), req.body)));
  api.post('/what-if/trial', (req, res) =>
    res.json(context.current.whatIf.trial(who(res), req.body?.scenarioId, req.body?.proposalId)),
  );
  api.post('/demo/telemetry', (req, res) => {
    const x = context.current;
    const s = x.repo.snapshot().state;
    const u = actor(s, who(res));
    const v = must(s.vehicles, text(req.body.vehicleId, 'Xe'));
    ensure(
      u.role === Role.OPERATOR ||
        (v.ownership === VehicleOwnership.PERSONAL && v.ownerId === u.id) ||
        [...s.rentals.values()].some(
          (r) => r.userId === u.id && r.vehicleId === v.id && r.status === RentalStatus.ACTIVE,
        ) ||
        [...s.dispatchOrders.values()].some(
          (o) =>
            o.technicianId === u.id &&
            o.status === DispatchStatus.IN_TRANSIT &&
            o.vehicleIds.includes(v.id),
        ),
      'Forbidden',
      'Bạn không được mô phỏng vị trí xe này.',
      403,
    );
    const h = must(s.hubs, text(req.body.hubId, 'Hub'));
    const batteryLevel =
      req.body.batteryLevel === undefined
        ? v.batteryLevel
        : numeric(req.body.batteryLevel, 'Pin', 0, 100);
    x.simulator.setTelemetry(v.id, { position: h.position, batteryLevel, locked: true });
    res.json({ ok: true, hubId: h.id });
  });
  api.post('/demo/command', (req, res) => {
    const x = context.current;
    const s = x.repo.snapshot().state;
    actor(s, who(res), [Role.OPERATOR]);
    const { target, command, success } = req.body;
    ensure(
      target &&
        ['VEHICLE', 'CHARGING_PORT'].includes(target.kind) &&
        Object.values(DeviceCommand).includes(command) &&
        typeof success === 'boolean',
      'ValidationError',
      'Cấu hình phản hồi giả lập không hợp lệ.',
      400,
    );
    if (target.kind === 'VEHICLE') must(s.vehicles, target.id);
    else must(s.ports, target.id);
    x.simulator.setCommandResult({ kind: target.kind, id: target.id }, command, success);
    res.json({ ok: true });
  });
  api.post('/demo/advance', (req, res) => {
    actor(context.current.repo.snapshot().state, who(res), [Role.OPERATOR]);
    numeric(req.body.seconds, 'Số giây', 1, 3600);
    res.json({ serverNow: context.current.advance(req.body.seconds) });
  });
  api.post('/demo/reset', (_req, res) => {
    actor(context.current.repo.snapshot().state, who(res), [Role.OPERATOR]);
    context.current = createSystem();
    res.clearCookie('hub_session', { path: '/' });
    res.json({ ok: true });
  });
  return api;
}
