import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRuntime } from './runtime.ts';

function startServer() {
  const host = process.env.HOST?.trim() || '127.0.0.1';
  const configuredPort = process.env.PORT ?? '3000';
  const port = Number(configuredPort);

  if (!/^\d+$/.test(configuredPort) || port < 1 || port > 65_535) {
    console.error('PORT must be an integer from 1 to 65535.');
    process.exitCode = 1;
    return;
  }

  const webRoot = fileURLToPath(new URL('../dist/web/', import.meta.url));
  const hasWebBuild = existsSync(new URL('../dist/web/index.html', import.meta.url));
  let runtime: ReturnType<typeof createRuntime>;
  try {
    runtime = createRuntime(process.env, hasWebBuild ? { root: webRoot } : undefined);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'API configuration is invalid.');
    process.exitCode = 1;
    return;
  }

  const { app, database, startWorker } = runtime;
  let stopWorker: (() => Promise<void>) | undefined;
  const server = app.listen(port, host);

  async function closeDatabase() {
    try {
      await stopWorker?.();
      await database?.close();
    } catch {
      console.error('MongoDB client could not shut down cleanly.');
      process.exitCode = 1;
    }
  }

  server.once('listening', () => {
    console.info('Arcshift API listening', { host, port });
    void database?.checkReadiness();
    stopWorker = startWorker?.();
  });

  server.once('error', (error: NodeJS.ErrnoException) => {
    console.error('Arcshift API server error', { code: error.code });
    process.exitCode = 1;
    void closeDatabase();
  });

  let stopping = false;

  function stopServer() {
    if (stopping) return;

    stopping = true;
    const deadline = setTimeout(() => server.closeAllConnections(), 10_000);
    deadline.unref();

    server.close((error) => {
      clearTimeout(deadline);
      if (error) {
        console.error('Arcshift API could not shut down cleanly', { message: error.message });
        process.exitCode = 1;
      }
      void closeDatabase();
    });
  }

  process.on('SIGINT', stopServer);
  process.on('SIGTERM', stopServer);
}

startServer();
