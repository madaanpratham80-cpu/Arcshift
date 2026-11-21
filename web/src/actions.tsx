import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { isPendingRun, request, runQuery } from './api';
import type { Run } from './types';
import { ErrorNotice, Loading } from './ui';

export function useRequestKey() {
  const previous = useRef<{ fingerprint: string; key: string } | null>(null);
  return {
    get(input: unknown) {
      const fingerprint = JSON.stringify(input);
      if (previous.current?.fingerprint !== fingerprint) {
        previous.current = { fingerprint, key: crypto.randomUUID() };
      }
      return previous.current.key;
    },
    clear() { previous.current = null; },
  };
}

export function useRun(id: string | null) {
  const client = useQueryClient();
  const query = useQuery(runQuery(id));
  const retry = useMutation({
    mutationFn: async (runId: string) => (await request<Run>('/ai/runs/' + runId + '/retry', { method: 'POST' })).data,
    onSuccess: (run) => client.setQueryData(runQuery(run.runId).queryKey, run),
  });
  return { query, retry };
}

export function RunProgress({ run, retry, label }: {
  run: Run | undefined | null; retry: ReturnType<typeof useRun>['retry']; label: string;
}) {
  if (isPendingRun(run)) return <Loading>{label}</Loading>;
  if (run?.status !== 'failed') return null;
  return <div className="run-failure">
    <div className="notice danger" role="alert">{run.error?.message ?? 'This request could not finish.'}</div>
    <ErrorNotice error={retry.error} />
    {run.retryable && <button className="button secondary" type="button" disabled={retry.isPending} onClick={() => retry.mutate(run.runId)}>
      {retry.isPending ? 'Retrying…' : 'Retry request'}
    </button>}
  </div>;
}
