import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { fastify } from 'fastify';
import routes from './connect.js';

export async function startServer({ port, host }: { port: number; host: string }): Promise<void> {
  const server = fastify();
  await server.register(fastifyConnectPlugin, {
    routes,
  });
  server.get('/', (_, reply) => {
    reply.type('text/plain');
    reply.send('Hello World!');
  });
  await server.listen({ host, port });
  console.log('server is listening at', server.addresses());
}
