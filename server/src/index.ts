import Fastify from 'fastify';
import path from 'path';
import { config } from './config';
import { initDatabase, closeDatabase } from './db/database';
import { healthRoutes } from './routes/health';
import { proxyRoutes } from './routes/proxy';

async function bootstrap(): Promise<void> {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.isProduction
          ? undefined
          : { target: 'pino-pretty', options: { colorize: true } },
    },
  });

  // CORS — only in development (browser hits localhost:4200)
  if (!config.isProduction) {
    await fastify.register(import('@fastify/cors'), {
      origin: 'http://localhost:4200',
    });
  }

  // API routes
  await fastify.register(healthRoutes);
  await fastify.register(proxyRoutes);

  // Static file serving + SPA fallback — production only
  if (config.isProduction) {
    const publicDir = path.join(__dirname, '..', 'public');

    await fastify.register(import('@fastify/static'), {
      root: publicDir,
      prefix: '/',
      decorateReply: false,
    });

    // SPA fallback — must be registered AFTER all API routes
    fastify.setNotFoundHandler((_request, reply) => {
      reply.sendFile('index.html', publicDir);
    });
  }

  // Initialise database
  await initDatabase();
  fastify.log.info('Database initialised');

  // Start listening
  await fastify.listen({ port: config.port, host: '0.0.0.0' });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    fastify.log.info(`Received ${signal} — shutting down gracefully`);
    await fastify.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
