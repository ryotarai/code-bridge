import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { WebClient } from '@slack/web-api';
import { fastify } from 'fastify';
import { buildRoutes } from './connect.js';
import { Database } from './database/database.js';
import { logger } from './logger.js';

export async function startServer({
  port,
  host,
  slackClient,
  database,
}: {
  port: number;
  host: string;
  slackClient: WebClient;
  database: Database;
}): Promise<void> {
  const server = fastify();
  await server.register(fastifyConnectPlugin, {
    routes: buildRoutes({ slackClient, database }),
  });
  server.get('/', (_, reply) => {
    reply.type('text/plain');
    reply.send('Hello World!');
  });
  await server.listen({ host, port });
  logger.info({ addresses: server.addresses() }, 'server is listening at');
}
