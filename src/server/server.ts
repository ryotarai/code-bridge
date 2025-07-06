import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { WebClient } from '@slack/web-api';
import { fastify } from 'fastify';
import { buildRoutes } from './connect.js';
import { SessionManager } from './sessions.js';

export async function startServer({
  port,
  host,
  slackClient,
  sessionManager,
}: {
  port: number;
  host: string;
  slackClient: WebClient;
  sessionManager: SessionManager;
}): Promise<void> {
  const server = fastify();
  await server.register(fastifyConnectPlugin, {
    routes: buildRoutes({ slackClient, sessionManager }),
  });
  server.get('/', (_, reply) => {
    reply.type('text/plain');
    reply.send('Hello World!');
  });
  await server.listen({ host, port });
  console.log('server is listening at', server.addresses());
}
