import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './routes/index.js';
import { createSystem, type AppContext } from './system.js';
import { DomainError } from './shared/errors.js';
export function createApp(initial = createSystem()) {
  const app = express();
  const context: AppContext = { current: initial };
  app.locals.context = context;
  app.disable('x-powered-by');
  app.set('json replacer', (_key: string, value: unknown) =>
    value instanceof Map ? Object.fromEntries(value) : value,
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host)
          return next(new DomainError('Forbidden', 'Nguồn yêu cầu không hợp lệ.', 403));
      } catch {
        return next(new DomainError('ValidationError', 'Origin không hợp lệ.', 400));
      }
    }
    if (
      ['POST', 'PATCH'].includes(req.method) &&
      (!req.is('application/json') ||
        !req.body ||
        typeof req.body !== 'object' ||
        Array.isArray(req.body))
    )
      return next(new DomainError('ValidationError', 'Yêu cầu phải là một JSON object.', 400));
    next();
  });
  app.use('/api', createApiRouter(context));
  app.use('/api', (_req, _res, next) =>
    next(new DomainError('NotFound', 'API không tồn tại.', 404)),
  );
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
  app.use(express.static(publicDir, { index: 'index.html', dotfiles: 'deny' }));
  app.use((_req, res) => res.status(404).send('Không tìm thấy trang.'));
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (error instanceof DomainError)
        return res
          .status(error.status)
          .json({ error: { code: error.code, message: error.message, details: error.details } });
      if (
        error &&
        typeof error === 'object' &&
        'type' in error &&
        error.type === 'entity.too.large'
      )
        return res
          .status(413)
          .json({ error: { code: 'PayloadTooLarge', message: 'Dữ liệu gửi lên quá lớn.' } });
      if (error instanceof SyntaxError)
        return res
          .status(400)
          .json({ error: { code: 'ValidationError', message: 'JSON không hợp lệ.' } });
      console.error(error);
      return res
        .status(500)
        .json({ error: { code: 'InternalError', message: 'Có lỗi xử lý. Vui lòng thử lại.' } });
    },
  );
  return app;
}
