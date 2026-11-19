import { Incident } from '../models/entities.js';
import { Role, IncidentStatus, VehicleStatus, PortStatus, DeviceCommand } from '../models/enums.js';
import type { IncidentDTO, IncidentFilterDTO } from '../models/types.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import { DeviceSimulator } from '../simulation/DeviceSimulator.js';
import { ensure, must, text } from '../shared/errors.js';
import { actor, resourceHub, restoreVehicle, restorePort } from '../shared/business.js';
import { id } from '../shared/security.js';
export class IncidentService {
  constructor(
    private repo: InMemoryRepository,
    private simulator: DeviceSimulator,
    private now = Date.now,
  ) {}
  report(userId: string, data: IncidentDTO): Incident {
    const description = text(data.description, 'Mô tả sự cố', 2000);
    ensure(
      data.target && ['VEHICLE', 'CHARGING_PORT'].includes(data.target.kind),
      'ValidationError',
      'Chỉ báo sự cố xe hoặc cổng sạc.',
      400,
    );
    return this.repo.transact((s) => {
      actor(s, userId);
      const resource =
        data.target.kind === 'VEHICLE'
          ? must(s.vehicles, data.target.id, 'Xe')
          : must(s.ports, data.target.id, 'Cổng sạc');
      ensure(
        ![...s.incidents.values()].some(
          (i) =>
            i.target.kind === data.target.kind &&
            i.target.id === data.target.id &&
            i.status !== IncidentStatus.RESOLVED,
        ),
        'DuplicateError',
        'Tài nguyên này đã có sự cố đang xử lý.',
      );
      const i = new Incident({
        id: id('incident'),
        reporterId: userId,
        target: { kind: data.target.kind, id: data.target.id },
        description,
        status: IncidentStatus.OPEN,
        createdAt: this.now(),
      });
      s.incidents.set(i.id, i);
      if (data.target.kind === 'VEHICLE') {
        if (resource.status === VehicleStatus.AVAILABLE)
          resource.status = VehicleStatus.MAINTENANCE;
      } else resource.status = PortStatus.FAULT;
      return i;
    });
  }
  list(actorId: string, filter: IncidentFilterDTO): Incident[] {
    const s = this.repo.snapshot().state;
    const u = actor(s, actorId);
    return [...s.incidents.values()]
      .filter((i) => u.role !== Role.CUSTOMER || i.reporterId === u.id)
      .filter(
        (i) =>
          (!filter.status || i.status === filter.status) &&
          (!filter.hubId || resourceHub(s, i.target) === filter.hubId) &&
          (!filter.technicianId || i.technicianId === filter.technicianId),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  accept(technicianId: string, incidentId: string): Incident {
    return this.repo.transact((s) => {
      actor(s, technicianId, [Role.TECHNICIAN]);
      const i = must(s.incidents, incidentId, 'Sự cố');
      ensure(
        i.status === IncidentStatus.OPEN && !i.technicianId,
        'AssignmentConflict',
        'Sự cố đã có người nhận.',
      );
      i.technicianId = technicianId;
      i.status = IncidentStatus.ASSIGNED;
      return i;
    });
  }
  resolve(technicianId: string, incidentId: string, notes: string): Incident {
    const resolutionNotes = text(notes, 'Ghi chú xử lý', 2000);
    return this.repo.transact((s) => {
      actor(s, technicianId, [Role.TECHNICIAN]);
      const i = must(s.incidents, incidentId, 'Sự cố');
      ensure(
        i.technicianId === technicianId,
        'Forbidden',
        'Bạn chưa được phân công sự cố này.',
        403,
      );
      ensure(
        i.status === IncidentStatus.ASSIGNED,
        'InvalidIncidentState',
        'Sự cố không ở trạng thái đang xử lý.',
      );
      ensure(
        this.simulator.execute(i.target, DeviceCommand.CHECK).success,
        'DeviceFailure',
        'Kiểm tra giả lập chưa thành công.',
      );
      i.status = IncidentStatus.RESOLVED;
      i.resolutionNotes = resolutionNotes;
      if (i.target.kind === 'VEHICLE') restoreVehicle(s, must(s.vehicles, i.target.id));
      else restorePort(s, i.target.id);
      return i;
    });
  }
}
