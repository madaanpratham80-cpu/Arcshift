import { queryOptions } from '@tanstack/react-query';
import type { Profile, Roadmap, Run, Session } from './types';

interface ErrorBody {
  code?: string;
  message?: string;
  requestId?: string;
  fieldErrors?: Record<string, string[]>;
}

export class ApiError extends Error {
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly status: number;

  constructor(status: number, problem: ErrorBody) {
    super(problem.message ?? 'The service could not complete this request.');
    this.status = status;
    this.code = problem.code;
    this.fieldErrors = problem.fieldErrors;
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  body?: unknown;
  key?: string;
  signal?: AbortSignal;
  renew?: boolean;
  notifyExpiry?: boolean;
}

export interface Envelope<T> {
  data: T;
  nextCursor?: string | null;
}

export const sessionExpired = 'career-agent:session-expired';

function fetchApi(path: string, options: Options = {}) {
  const { method = 'GET', body, key, signal } = options;
  const headers = new Headers({ Accept: 'application/json' });
  if (key) headers.set('Idempotency-Key', key);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return fetch('/api' + path, {
    method, headers, signal, cache: 'no-store', credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

let refreshInFlight: Promise<boolean> | undefined;

function renewSession(): Promise<boolean> {
  async function renew() {
    if ((await fetchApi('/auth/session')).ok) return true;
    if ((await fetchApi('/auth/refresh', { method: 'POST' })).ok) return true;
    return (await fetchApi('/auth/session')).ok;
  }

  async function lockedRenew() {
    return navigator.locks ? await navigator.locks.request('career-agent-session', renew) : await renew();
  }

  refreshInFlight ??= lockedRenew().finally(() => { refreshInFlight = undefined; });
  return refreshInFlight;
}

export async function request<T>(path: string, options: Options = {}): Promise<Envelope<T>> {
  let response = await fetchApi(path, options);
  if (response.status === 401 && options.renew !== false) {
    const problem = await response.clone().json().catch(() => ({})) as ErrorBody;
    if (problem.code === 'SIGN_IN_REQUIRED') {
      if (await renewSession()) {
        response = await fetchApi(path, options);
      }
      if (response.status === 401 && options.notifyExpiry !== false) {
        window.dispatchEvent(new Event(sessionExpired));
      }
    }
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({})) as ErrorBody;
    throw new ApiError(response.status, problem);
  }
  if (response.status === 204) return { data: undefined as T };
  return response.json() as Promise<Envelope<T>>;
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'AI_UNAVAILABLE') return 'The AI service is unavailable. Your saved work is still available.';
    if (error.code === 'NOT_READY' || error.code === 'AUTH_UNAVAILABLE') return 'The backend is unavailable. Try again in a moment.';
    if (error.code === 'TRANSACTIONS_REQUIRED') return 'This action needs a MongoDB replica set. Your saved work is still available.';
    return error.message;
  }
  return 'We could not reach the service. Check your connection and try again.';
}

export const sessionKey = ['session'] as const;
export const profileKey = ['profile'] as const;
export const activityKey = ['activity'] as const;
export const roadmapKey = ['roadmap'] as const;
export const conversationKey = ['conversations'] as const;

export async function readSession(signal?: AbortSignal) {
  try {
    return (await request<Session>('/auth/session', { signal, notifyExpiry: false })).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export const sessionQuery = queryOptions({
  queryKey: sessionKey, queryFn: ({ signal }) => readSession(signal), staleTime: 30_000,
});
export const profileQuery = queryOptions({
  queryKey: profileKey, queryFn: async ({ signal }) => (await request<{ profile: Profile | null }>('/profile', { signal })).data.profile,
});
export const roadmapQuery = queryOptions({
  queryKey: roadmapKey, queryFn: async ({ signal }) => (await request<{ roadmap: Roadmap | null; run: Run | null }>('/roadmap', { signal })).data,
});

export function runQuery(id: string | null) {
  return queryOptions({
    queryKey: ['run', id],
    enabled: !!id,
    queryFn: async ({ signal }) => (await request<Run>('/ai/runs/' + id, { signal })).data,
    refetchInterval: (query) => query.state.status !== 'error' && isPendingRun(query.state.data) ? 1_050 : false,
  });
}

export function isPendingRun(run: Run | undefined | null) {
  return run?.status === 'queued' || run?.status === 'running';
}

export function searchPage(cursor: string | null, limit: number) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return '?' + params.toString();
}
