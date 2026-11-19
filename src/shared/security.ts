import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import type { User } from '../models/entities.js';
import type { PublicUserDTO } from '../models/types.js';
import { ensure } from './errors.js';
export const id = (prefix: string) => `${prefix}-${randomUUID()}`;
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, encoded: string): boolean {
  const [salt, hash] = encoded.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function validatePassword(password: string, confirm: string): void {
  ensure(
    typeof password === 'string' &&
      password.length >= 8 &&
      password.length <= 128 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /\d/.test(password),
    'ValidationError',
    'Mật khẩu cần 8–128 ký tự, có chữ hoa, chữ thường và số.',
    400,
  );
  ensure(password === confirm, 'ValidationError', 'Xác nhận mật khẩu không khớp.', 400);
}
export function publicUser(user: User): PublicUserDTO {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
}
