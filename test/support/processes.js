import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export async function getLoopbackPort() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

export async function startProcess(command, args, options) {
  const child = spawn(command, args, { stdio: 'ignore', ...options });
  await once(child, 'spawn');
  return child;
}

export async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const forceStop = setTimeout(() => child.kill('SIGKILL'), 5_000);
  const stopped = once(child, 'exit');
  try {
    child.kill('SIGTERM');
    return await stopped;
  } finally {
    clearTimeout(forceStop);
  }
}

export async function waitForStatus(origin, path, status) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin + path, { signal: AbortSignal.timeout(6_000) });
      const body = await response.json();
      if (response.status === status) return body;
    } catch (error) {
      if (!(error instanceof TypeError) && error.name !== 'TimeoutError') throw error;
    }
    await delay(100);
  }
  assert.fail(`${path} did not reach HTTP ${status}`);
}
