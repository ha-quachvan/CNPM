import { ReservationService } from '../services/ReservationService.js';
import { ChargingService } from '../services/ChargingService.js';
export class BackgroundJobs {
  constructor(
    private reservations: ReservationService,
    private charging: ChargingService,
  ) {}
  tick(now: number): void {
    this.reservations.expire(now);
    this.charging.advance(now);
    this.charging.schedule(now);
  }
}
