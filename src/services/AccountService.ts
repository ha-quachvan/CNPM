import { randomInt } from 'node:crypto';
import { User, Session } from '../models/entities.js';
import { Role } from '../models/enums.js';
import type {
  RegisterDTO,
  PublicUserDTO,
  SessionDTO,
  ProfileDTO,
  ResetChallenge,
  ResetChallengeDTO,
  PasswordResetDTO,
  NetworkState,
} from '../models/types.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import { DemoAuthProvider } from '../simulation/DemoAuthProvider.js';
import { config, minute } from '../shared/config.js';
import { ensure, text, must, DomainError } from '../shared/errors.js';
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  publicUser,
  id,
} from '../shared/security.js';
import { actor } from '../shared/business.js';
function contact(email?: unknown, phone?: unknown) {
  const e = email === undefined || email === '' ? undefined : text(email, 'Email').toLowerCase();
  const p = phone === undefined || phone === '' ? undefined : text(phone, 'Số điện thoại', 16);
  ensure(!e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), 'ValidationError', 'Email không hợp lệ.', 400);
  ensure(!p || /^\+?\d{9,15}$/.test(p), 'ValidationError', 'Số điện thoại không hợp lệ.', 400);
  ensure(e || p, 'ValidationError', 'Cần email hoặc số điện thoại.', 400);
  return { email: e, phone: p };
}
function unique(s: NetworkState, email?: string, phone?: string, except?: string) {
  ensure(
    ![...s.users.values()].some(
      (u) => u.id !== except && ((email && u.email === email) || (phone && u.phone === phone)),
    ),
    'DuplicateError',
    'Email hoặc số điện thoại đã được sử dụng.',
    400,
  );
}
export class AccountService {
  private resetChallenges = new Map<string, ResetChallenge>();
  constructor(
    private repo: InMemoryRepository,
    private provider: DemoAuthProvider,
    private now = Date.now,
  ) {}
  register(data: RegisterDTO): PublicUserDTO {
    const fullName = text(data.fullName, 'Họ tên', 80);
    const c = contact(data.email, data.phone);
    validatePassword(data.password, data.confirmPassword);
    const passwordHash = hashPassword(data.password);
    return this.repo.transact((s) => {
      unique(s, c.email, c.phone);
      const user = new User({
        id: id('usr'),
        fullName,
        ...c,
        passwordHash,
        role: Role.CUSTOMER,
        failedLoginCount: 0,
        restricted: false,
      });
      s.users.set(user.id, user);
      return publicUser(user);
    });
  }
  login(identifier: string, password: string): SessionDTO {
    const key = text(identifier, 'Email / SĐT').toLowerCase();
    text(password, 'Mật khẩu', 128);
    const outcome = this.repo.transact((s) => {
      const u = [...s.users.values()].find((u) => u.email === key || u.phone === key);
      if (!u) return { error: 'InvalidCredentials' };
      const now = this.now();
      if (u.lockedUntil && u.lockedUntil > now) return { error: 'AccountLocked' };
      if (!u.failedWindowStart || now - u.failedWindowStart >= config.loginWindowMinutes * minute) {
        u.failedLoginCount = 0;
        u.failedWindowStart = now;
      }
      if (!verifyPassword(password, u.passwordHash)) {
        u.failedLoginCount++;
        if (u.failedLoginCount >= config.maxLoginFailures)
          u.lockedUntil = now + config.loginWindowMinutes * minute;
        return {
          error: u.lockedUntil && u.lockedUntil > now ? 'AccountLocked' : 'InvalidCredentials',
        };
      }
      u.failedLoginCount = 0;
      u.failedWindowStart = undefined;
      u.lockedUntil = undefined;
      return { session: this.createSession(s, u) };
    });
    if (outcome.error)
      throw new DomainError(
        outcome.error,
        outcome.error === 'AccountLocked'
          ? 'Tài khoản bị khóa 15 phút do đăng nhập sai nhiều lần.'
          : 'Email / SĐT hoặc mật khẩu không đúng.',
        401,
      );
    return outcome.session!;
  }
  logout(token: string): void {
    this.repo.transact((s) => {
      s.sessions.delete(token);
    });
  }
  getProfile(userId: string): PublicUserDTO {
    const u = this.repo.get<User>('users', userId);
    ensure(u, 'NotFound', 'Tài khoản không tồn tại.', 404);
    return publicUser(u);
  }
  updateProfile(userId: string, data: ProfileDTO): PublicUserDTO {
    return this.repo.transact((s) => {
      const u = actor(s, userId);
      const c = contact(data.email ?? u.email, data.phone ?? u.phone);
      unique(s, c.email, c.phone, u.id);
      u.fullName = data.fullName === undefined ? u.fullName : text(data.fullName, 'Họ tên', 80);
      u.email = c.email;
      u.phone = c.phone;
      return publicUser(u);
    });
  }
  requestPasswordReset(identifier: string): ResetChallengeDTO {
    const key = text(identifier, 'Email / SĐT').toLowerCase();
    const user = this.repo.list<User>('users').find((u) => u.email === key || u.phone === key);
    ensure(user, 'NotFound', 'Không tìm thấy tài khoản demo.', 404);
    for (const [k, c] of this.resetChallenges)
      if (c.userId === user.id || c.expiresAt <= this.now()) this.resetChallenges.delete(k);
    const demoCode = String(randomInt(100000, 1000000));
    const challengeId = id('reset');
    const expiresAt = this.now() + config.passwordResetMinutes * minute;
    this.resetChallenges.set(challengeId, {
      challengeId,
      userId: user.id,
      codeHash: hashPassword(demoCode),
      expiresAt,
    });
    return { challengeId, expiresAt, demoCode };
  }
  resetPassword(data: PasswordResetDTO): void {
    const c = this.resetChallenges.get(data.challengeId);
    ensure(
      c &&
        c.expiresAt > this.now() &&
        typeof data.code === 'string' &&
        verifyPassword(data.code, c.codeHash),
      'InvalidResetCode',
      'Mã xác minh sai hoặc đã hết hạn.',
      400,
    );
    validatePassword(data.newPassword, data.confirmPassword);
    const passwordHash = hashPassword(data.newPassword);
    this.repo.transact((s) => {
      const u = must(s.users, c.userId);
      u.passwordHash = passwordHash;
      u.failedLoginCount = 0;
      u.lockedUntil = undefined;
      u.failedWindowStart = undefined;
      for (const [k, v] of s.sessions) if (v.userId === u.id) s.sessions.delete(k);
    });
    this.resetChallenges.delete(c.challengeId);
  }
  loginWithProvider(token: string): SessionDTO {
    const identity = this.provider.verify(text(token, 'Token demo'));
    return this.repo.transact((s) => {
      let u = [...s.users.values()].find((u) => u.email === identity.email);
      if (!u) {
        u = new User({
          id: id('usr'),
          fullName: identity.fullName,
          email: identity.email,
          passwordHash: hashPassword(id('random')),
          role: Role.CUSTOMER,
          failedLoginCount: 0,
          restricted: false,
        });
        s.users.set(u.id, u);
      }
      ensure(
        !u.lockedUntil || u.lockedUntil <= this.now(),
        'AccountLocked',
        'Tài khoản tạm thời bị khóa.',
        401,
      );
      return this.createSession(s, u);
    });
  }
  private createSession(s: NetworkState, u: User): SessionDTO {
    const token = id('session');
    const expiresAt = this.now() + config.sessionHours * 60 * minute;
    s.sessions.set(token, new Session({ id: token, userId: u.id, expiresAt }));
    return { token, expiresAt, user: publicUser(u) };
  }
}
