import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ListChecks } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiError, request, roadmapKey } from './api';
import { versionsKey } from './roadmap';
import type { Milestone, Proposal, RevisionDiff, Roadmap } from './types';
import { ErrorNotice, Loading, PageHeading, Status, safeHref } from './ui';

const changeLabel: Record<RevisionDiff['type'], string> = {
  target_changed: 'Target role changed', assumptions_cleared: 'Assumptions cleared',
  phase_added: 'Phase added', phase_removed: 'Phase removed', milestone_added: 'Milestone added',
  milestone_edited: 'Milestone edited', milestone_retired: 'Milestone retired', milestone_status: 'Milestone status changed',
};

type Value = RevisionDiff['before'] | RevisionDiff['after'];

function isMilestone(value: { title: string }): value is Milestone {
  return 'completionCriterion' in value;
}

function DiffValue({ value, other }: { value: Value; other: Value }) {
  if (value === null) return <p className="muted">None</p>;
  if (typeof value === 'string') return <p>{value}</p>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p className="muted">None</p>;
  if (!isMilestone(value)) return <p>{value.title}</p>;

  const compare = other && typeof other === 'object' && !Array.isArray(other) && isMilestone(other) ? other : null;
  const fields = [
    ['Action', value.action, compare?.action],
    ['Rationale', value.rationale, compare?.rationale],
    ['Completion criteria', value.completionCriterion, compare?.completionCriterion],
    ['Estimated time', value.estimatedHours + ' h', compare ? compare.estimatedHours + ' h' : null],
  ].filter(([, current, previous]) => !compare || current !== previous);
  const evidence = safeHref(value.evidenceUrl);
  const showEvidence = compare ? value.evidenceUrl !== compare.evidenceUrl : evidence != null;
  return <>
    <p><strong>{value.title}</strong> <Status value={value.status} /></p>
    <dl>
      {fields.map(([label, content]) => <div key={label}><dt>{label}</dt><dd>{content}</dd></div>)}
      {showEvidence && <div><dt>Evidence</dt><dd>{evidence ? <a href={evidence} target="_blank" rel="noopener noreferrer">View evidence</a> : 'None'}</dd></div>}
    </dl>
  </>;
}

export function ProposalPage() {
  const { id } = useParams();
  const client = useQueryClient();
  const proposalKey = ['proposal', id] as const;
  const query = useQuery({
    queryKey: proposalKey,
    queryFn: async ({ signal }) => (await request<{ proposal: Proposal }>('/roadmap/proposals/' + id, { signal })).data.proposal,
  });
  const apply = useMutation({
    mutationFn: async () => (await request<{ roadmap: Roadmap }>('/roadmap/proposals/' + id + '/apply', { method: 'POST' })).data.roadmap,
    onSuccess: (roadmap) => {
      client.setQueryData<Proposal>(proposalKey, (item) => item ? { ...item, status: 'applied', appliedVersion: roadmap.version } : item);
      void client.invalidateQueries({ queryKey: roadmapKey });
      void client.invalidateQueries({ queryKey: versionsKey });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'PROPOSAL_STALE') void client.invalidateQueries({ queryKey: proposalKey });
    },
  });
  const proposal = query.data;
  return <>
    <PageHeading title="Review roadmap changes" description="See what the coach suggests before you update your plan."
      actions={proposal && <Link className="button secondary" to={'/app/coach/' + proposal.conversationId}>Back to conversation</Link>} />
    {query.isPending && <Loading>Loading proposal…</Loading>}
    <ErrorNotice error={query.error} retry={() => void query.refetch()} />
    {proposal && <>
      <section className="card proposal-intro">
        <span className="feature-icon"><ListChecks size={21} aria-hidden="true" /></span>
        <h2>Why this change was suggested</h2><p>{proposal.rationale}</p>
        <span className="muted">Based on roadmap version {proposal.baseRoadmapVersion}.</span>
      </section>
      <ol className="change-list">{proposal.diff.map((change, index) => <li className="card change-card" key={index}>
        <h2>{changeLabel[change.type]}</h2>
        <div className="diff-grid">
          <div><h3>Before</h3><DiffValue value={change.before} other={change.after} /></div>
          <div><h3>After</h3><DiffValue value={change.after} other={change.before} /></div>
        </div>
      </li>)}</ol>
      <section className="card approval-card" aria-label="Proposal decision">
        {proposal.status === 'stale' && <div className="notice danger" role="status">Your profile or roadmap has changed. Ask your coach for a new proposal.</div>}
        {proposal.status === 'applied' && <div className="notice success" role="status"><Check size={18} aria-hidden="true" />Changes applied to version {proposal.appliedVersion}.</div>}
        <ErrorNotice error={proposal.status === 'stale' ? null : apply.error} />
        <div className="inline-actions">
          {proposal.status === 'pending' && <button type="button" className="button primary" disabled={apply.isPending} onClick={() => apply.mutate()}>{apply.isPending ? 'Applying…' : 'Apply changes'}</button>}
          <Link className="button secondary" to={proposal.status === 'stale' ? '/app/coach/' + proposal.conversationId : '/app'}>
            {proposal.status === 'pending' ? 'Keep current plan' : proposal.status === 'applied' ? 'View current roadmap' : 'Ask your coach'}
          </Link>
        </div>
      </section>
    </>}
  </>;
}
