import { createSeed } from './data/seed.js';
import { InMemoryRepository } from './repositories/InMemoryRepository.js';
import { DeviceSimulator } from './simulation/DeviceSimulator.js';
import { DemoAuthProvider } from './simulation/DemoAuthProvider.js';
import { WhatIfEngine } from './simulation/WhatIfEngine.js';
import { AccountService } from './services/AccountService.js';
import { HubService } from './services/HubService.js';
import { ReservationService } from './services/ReservationService.js';
import { RentalService } from './services/RentalService.js';
import { ChargingService } from './services/ChargingService.js';
import { IncidentService } from './services/IncidentService.js';
import { DispatchService } from './services/DispatchService.js';
import { WhatIfService } from './services/WhatIfService.js';
import { BackgroundJobs } from './jobs/BackgroundJobs.js';
export function createSystem() {
  let offset = 0;
  const now = () => Date.now() + offset;
  const state = createSeed(now());
  const repo = new InMemoryRepository(state, now);
  const simulator = new DeviceSimulator([...state.vehicles.values()], now);
  for (const v of state.vehicles.values())
    if (v.currentHubId)
      simulator.setTelemetry(v.id, {
        position: state.hubs.get(v.currentHubId)!.position,
        batteryLevel: v.batteryLevel,
        locked: true,
      });
  const account = new AccountService(repo, new DemoAuthProvider(), now);
  const hubs = new HubService(repo);
  const reservations = new ReservationService(repo, now);
  const rental = new RentalService(repo, simulator, now);
  const charging = new ChargingService(repo, now);
  const incidents = new IncidentService(repo, simulator, now);
  const dispatch = new DispatchService(repo, simulator, now);
  const whatIf = new WhatIfService(repo, new WhatIfEngine(now), now);
  const jobs = new BackgroundJobs(reservations, charging);
  return {
    repo,
    simulator,
    account,
    hubs,
    reservations,
    rental,
    charging,
    incidents,
    dispatch,
    whatIf,
    jobs,
    now,
    advance(seconds: number) {
      offset += seconds * 1000;
      jobs.tick(now());
      return now();
    },
  };
}
export type System = ReturnType<typeof createSystem>;
export interface AppContext {
  current: System;
}
