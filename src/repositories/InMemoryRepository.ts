import { NetworkSnapshot } from '../models/entities.js';
import type { Collection, NetworkState, StateAction } from '../models/types.js';
import { ensure } from '../shared/errors.js';
export class InMemoryRepository {
  private state: NetworkState;
  constructor(
    state: NetworkState,
    private now = Date.now,
  ) {
    this.state = structuredClone(state);
  }
  get<T>(collection: Collection, id: string): T | undefined {
    return structuredClone(this.state[collection].get(id)) as T | undefined;
  }
  list<T>(collection: Collection): T[] {
    return structuredClone([...this.state[collection].values()]) as T[];
  }
  transact<T>(action: StateAction<T>): T {
    const draft = structuredClone(this.state);
    const result = action(draft);
    ensure(!(result instanceof Promise), 'InvalidTransaction', 'Callback cập nhật phải đồng bộ.');
    const detached = structuredClone(result);
    this.state = structuredClone(draft);
    return detached;
  }
  snapshot(): NetworkSnapshot {
    return new NetworkSnapshot({ capturedAt: this.now(), state: structuredClone(this.state) });
  }
}
