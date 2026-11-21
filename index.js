// The Vercel Express preset recognizes this entrypoint by its Express import.
import 'express';
import { waitUntil } from '@vercel/functions';
import { createRuntime } from './dist/runtime.js';
import html from './dist/web-document.js';

const env = { ...process.env, TRUST_PROXY_HOPS: process.env.TRUST_PROXY_HOPS ?? '1' };
const { app } = createRuntime(env, { html }, (work) => {
  // Leave time to release the MongoDB lease before Vercel ends the invocation.
  waitUntil(work(AbortSignal.timeout(270_000)).catch(() => {
    console.warn('AI invocation could not process pending work.');
  }));
});

export default app;
