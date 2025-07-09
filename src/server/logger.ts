import createLogger, { Logger } from 'pino';

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger: Logger = createLogger({
  level: logLevel,
});
