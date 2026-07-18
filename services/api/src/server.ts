import { z } from 'zod';

import { buildApp } from './app.js';
import { startNotificationSweeper } from './notifications/service.js';

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
    WEB_ORIGINS: z.string().optional(),
    DATABASE_URL: z.string().url({ message: 'must be a PostgreSQL connection URL' }),
    REDIS_URL: z.string().url().optional(),
    JWT_ACCESS_SECRET: z.string().min(32).optional(),
    TRUST_PROXY: z.string().optional(),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && !environment.JWT_ACCESS_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'is required in production',
      });
    }
    if (environment.NODE_ENV === 'production' && !environment.REDIS_URL) {
      context.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'is required in production',
      });
    }
  });

const environment = environmentSchema.parse(process.env);
const app = buildApp();
const stopSweeper = startNotificationSweeper((error) =>
  app.log.error({ err: error }, 'Notification sweep failed'),
);
app.addHook('onClose', () => stopSweeper());

try {
  await app.listen({ host: environment.HOST, port: environment.PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
