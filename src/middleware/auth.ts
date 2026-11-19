import type { Request, RequestHandler } from 'express';
import type { AppContext } from '../system.js';
import type { Session, User } from '../models/entities.js';
import { ensure } from '../shared/errors.js';
export function tokenOf(req: Request): string {
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) return bearer;
  const encoded = req.headers.cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('hub_session='))
    ?.slice('hub_session='.length);
  try {
    return encoded ? decodeURIComponent(encoded) : '';
  } catch {
    return '';
  }
}
export function authenticate(context: AppContext): RequestHandler {
  return (req, res, next) => {
    const session = context.current.repo.get<Session>('sessions', tokenOf(req));
    ensure(
      session && session.expiresAt > context.current.now(),
      'Unauthorized',
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      401,
    );
    const user = context.current.repo.get<User>('users', session.userId);
    ensure(user, 'Unauthorized', 'Phiên không còn hợp lệ.', 401);
    res.locals.user = user;
    next();
  };
}
