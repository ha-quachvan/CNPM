import type { ProviderIdentityDTO } from '../models/types.js';
import { ensure } from '../shared/errors.js';
export class DemoAuthProvider {
  private identities = new Map<string, ProviderIdentityDTO>([
    [
      'google-demo-customer',
      {
        provider: 'google',
        subject: 'demo-google-01',
        email: 'customer@hub.local',
        fullName: 'Nguyễn Minh Anh',
      },
    ],
    [
      'clerk-demo-customer',
      {
        provider: 'clerk',
        subject: 'demo-clerk-01',
        email: 'customer@hub.local',
        fullName: 'Nguyễn Minh Anh',
      },
    ],
  ]);
  verify(token: string): ProviderIdentityDTO {
    const identity = this.identities.get(token);
    ensure(identity, 'InvalidProviderToken', 'Token danh tính demo không hợp lệ.', 401);
    return structuredClone(identity);
  }
}
