import type { FastifyServerOptions } from 'fastify';
import type { Config } from '../config.js';

type LoggerOption = Exclude<FastifyServerOptions['logger'], undefined>;

export function buildLoggerOptions(config: Config): LoggerOption {
  if (config.NODE_ENV === 'test') {
    return false;
  }

  return {
    level: config.LOG_LEVEL,
    ...(config.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty' } }
      : {}),
  };
}
