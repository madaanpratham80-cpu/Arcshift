import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Clock3, Compass, ExternalLink, History, ListChecks, Sparkles, Target } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { RunProgress, useRequestKey, useRun } from './actions';
import { activityKey, ApiError, isPendingRun, profileKey, profileQuery, request, roadmapKey, roadmapQuery, runQuery, searchPage } from './api';
import { CareerActivity } from './activity';
import type { Milestone, MilestoneStatus, Roadmap as RoadmapData, Run, VersionSummary } from './types';
import { EmptyState, ErrorNotice, formatDate, Loading, PageHeading, safeHref, Status, statusLabels } from './ui';

export const versionsKey = ['versions'] as const;
type RoadmapResult = { roadmap: RoadmapData; run: null };

function Editor({ milestone, version, onClose }: { milestone: Milestone; version: number; onClose: () => void }) {
  const client = useQueryClient();
  const key = useRequestKey();
  const statusId = useId();
  const [invalidLink, setInvalidLink] = useState(false);
  const save = useMutation({
    mutationFn: async (body: { expectedRoadmapVersion: number; status: MilestoneStatus; evidenceUrl: string | null }) => {
      const response = await request<{ roadmap: RoadmapData }>('/roadmap/milestones/' + milestone.id, {
        method: 'PATCH', key: key.get(body), body,
      });
      return response.data.roadmap;
    },
    onSuccess: (roadmap) => {
      key.clear();
      client.setQueryData<RoadmapResult>(roadmapKey, (current) => current?.roadmap && current.roadmap.version > roadmap.version ? current : { roadmap, run: null });
      void client.invalidateQueries({ queryKey: activityKey });
      void client.invalidateQueries({ queryKey: versionsKey });
      void client.invalidateQueries({ queryKey: roadmapKey });
      onClose();
    },
  });
  const conflict = save.error instanceof ApiError && save.error.code === 'ROADMAP_VERSION_CONFLICT';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const raw = String(fields.get('evidence') ?? '').trim();
    if (raw && !safeHref(raw)) {
      setInvalidLink(true);
      return;
    }
    setInvalidLink(false);
    save.mutate({ expectedRoadmapVersion: version, status: fields.get('status') as MilestoneStatus, evidenceUrl: raw || null });
  }

  return <form className="stack milestone-editor" onSubmit={submit} aria-label="Milestone progress">
    <div className="form-grid editor-fields">
      <div><label htmlFor={statusId}>Status</label><select id={statusId} name="status" defaultValue={milestone.status}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <label>Evidence link <span className="optional">Optional</span><input name="evidence" type="url" defaultValue={milestone.evidenceUrl ?? ''} maxLength={2048} placeholder="https://…" /></label>
    </div>
    {invalidLink && <div className="notice danger" role="alert">Enter an HTTP or HTTPS link.</div>}
    <ErrorNotice error={save.error} />
    <div className="inline-actions">
      {conflict ? <button type="button" className="button secondary" onClick={() => {
        void client.invalidateQueries({ queryKey: roadmapKey });
        onClose();
      }}>Load latest roadmap</button> : <button className="button primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save progress'}</button>}
      <button type="button" className="button quiet" onClick={onClose} disabled={save.isPending}>Cancel</button>
    </div>
  </form>;
}

function RoadmapMilestone({ milestone, version, editable, next }: { milestone: Milestone; version: number; editable: boolean; next: boolean }) {
  const [editing, setEditing] = useState(false);
  const link = safeHref(milestone.evidenceUrl);
  return <article className="milestone" id={'milestone-' + milestone.id}>
    <div className="milestone-icon" data-status={milestone.status}>{milestone.status === 'completed' ? <Check size={17} aria-hidden="true" /> : <Target size={17} aria-hidden="true" />}</div>
    <div className="milestone-main">
      <div className="milestone-head"><h3>{milestone.title}</h3><Status value={milestone.status} /></div>
      <p>{milestone.action}</p>
      <details className="milestone-detail">
        <summary>Milestone details <ChevronDown size={14} aria-hidden="true" /></summary>
        <div><p>{milestone.rationale}</p><p><strong>Completion criteria</strong> {milestone.completionCriterion}</p></div>
      </details>
      <div className="milestone-meta">
        <span><Clock3 size={14} aria-hidden="true" />{milestone.estimatedHours} h</span>
        {next && <span><span className="small-dot" />Up next</span>}
        {link && <a href={link} target="_blank" rel="noopener noreferrer">View evidence <ExternalLink size={14} aria-hidden="true" /></a>}
        {editable && !editing && <button className="text-button" type="button" onClick={() => setEditing(true)} aria-label={'Update progress for ' + milestone.title}>Update progress</button>}
      </div>
      {editing && <Editor key={version} milestone={milestone} version={version} onClose={() => setEditing(false)} />}
    </div>
  </article>;
}

export function RoadmapView({ roadmap, editable }: { roadmap: RoadmapData; editable: boolean }) {
  const { completedCount, milestoneCount, nextMilestoneId } = roadmap.progress;
  const milestones = roadmap.phases.flatMap((phase) => phase.milestones);
  const nextMilestone = milestones.find((item) => item.id === nextMilestoneId);
  const inProgress = milestones.filter((item) => item.status === 'in_progress').length;
  const hoursRemaining = milestones.reduce((hours, item) => item.status === 'completed' ? hours : hours + item.estimatedHours, 0);
  const percent = milestoneCount ? Math.round(completedCount / milestoneCount * 100) : 0;
  return <>
    <div className={editable ? "dashboard-summary" : undefined}>
    <section className={"roadmap-banner" + (editable ? " dashboard-banner" : "")} aria-label="Roadmap progress">
      <div>
        <span className="banner-label"><Compass size={17} aria-hidden="true" />{editable ? 'Current roadmap' : 'Saved version ' + roadmap.version}</span>
        <h2>{roadmap.targetRole}</h2>
        <div className="banner-progress">
          <div><span>{completedCount} of {milestoneCount} milestones complete</span><strong>{percent}%</strong></div>
          <progress value={completedCount} max={milestoneCount || 1} aria-label="Milestones completed" />
        </div>
      </div>
      <div className="banner-art" aria-hidden="true"><Compass strokeWidth={1} /></div>
    </section>
    {editable && <div className="dashboard-metrics" aria-label="Milestone totals">
      <section className="card dashboard-stat"><span className="feature-icon"><Check size={19} aria-hidden="true" /></span><h2>Completed</h2><p>{completedCount}</p></section>
      <section className="card dashboard-stat"><span className="feature-icon"><Target size={19} aria-hidden="true" /></span><h2>In progress</h2><p>{inProgress}</p></section>
      <section className="card dashboard-stat"><span className="feature-icon"><Clock3 size={19} aria-hidden="true" /></span><h2>Planned hours left</h2><p>{new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(hoursRemaining)}</p></section>
    </div>}
    </div>
    {editable && <CareerActivity />}
    <div className="roadmap-grid">
      <div className="phase-list">
        {roadmap.phases.map((phase, index) => <section className="card phase" key={phase.id}>
          <div className="phase-head"><div className="phase-number">{index + 1}</div><div><h2>{phase.title}</h2>
            <p>{phase.milestones.length} {phase.milestones.length === 1 ? 'milestone' : 'milestones'}</p></div></div>
          {phase.milestones.map((milestone) => <RoadmapMilestone key={milestone.id} milestone={milestone} version={roadmap.version} editable={editable} next={milestone.id === nextMilestoneId} />)}
        </section>)}
        {!roadmap.phases.length && <EmptyState icon={ListChecks} title="No milestones in this version" />}
      </div>
      <aside className="roadmap-aside" aria-label="Plan details">
        {editable && <section className="card next-card">
          <span className="feature-icon"><Target size={20} aria-hidden="true" /></span>
          <h2>Up next</h2>
          {nextMilestone ? <><p>{nextMilestone.title}</p><a className="text-button" href={'#milestone-' + nextMilestone.id}>View milestone</a></> : <p>You’ve completed the milestones in this plan.</p>}
        </section>}
        {editable && roadmap.phases.length > 0 && <section className="card next-card phase-overview">
          <h2>Phase progress</h2>
          {roadmap.phases.map((phase) => {
            const done = phase.milestones.filter((item) => item.status === 'completed').length;
            return <div className="phase-progress" key={phase.id}><div><span>{phase.title}</span><span>{done} / {phase.milestones.length}</span></div>
              <progress aria-label={phase.title} value={done} max={phase.milestones.length} /></div>;
          })}
        </section>}
        {editable && <section className="card next-card"><span className="feature-icon"><Sparkles size={20} aria-hidden="true" /></span><h2>Work with your coach</h2><p>Talk through a blocker or ask for a change to your plan.</p><Link className="text-button" to="/app/coach">Open AI Coach</Link></section>}
        {!!roadmap.assumptions.length && <section className="card next-card"><h2>Plan assumptions</h2><ul>{roadmap.assumptions.map((text, index) => <li key={index}>{text}</li>)}</ul></section>}
      </aside>
    </div>
  </>;
}

export function RoadmapPage() {
  const client = useQueryClient();
  const current = useQuery(roadmapQuery);
  const profile = useQuery(profileQuery);
  const key = useRequestKey();
  const latest = current.data?.run;
  const runId = latest?.runId ?? null;
  const { query, retry } = useRun(runId);
  const run = query.data ?? latest;
  const status = run?.status;
  const generate = useMutation({
    mutationFn: async (expectedProfileVersion: number) => {
      const body = { expectedProfileVersion };
      return (await request<Run>('/roadmap/generate', { method: 'POST', body, key: key.get(body) })).data;
    },
    onSuccess: (next) => {
      key.clear();
      client.setQueryData(runQuery(next.runId).queryKey, next);
      client.setQueryData(roadmapKey, { roadmap: null, run: next });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        void client.invalidateQueries({ queryKey: roadmapKey });
        void client.invalidateQueries({ queryKey: profileKey });
      }
    },
  });

  useEffect(() => {
    if (status === 'succeeded') {
      void client.invalidateQueries({ queryKey: roadmapKey });
      void client.invalidateQueries({ queryKey: activityKey });
      void client.invalidateQueries({ queryKey: versionsKey });
    }
  }, [client, status, runId]);

  const roadmap = current.data?.roadmap;
  const inFlight = isPendingRun(run);
  return <>
    <PageHeading title="Your roadmap" description="Track the steps toward your target role."
      actions={roadmap && <Link to="/app/versions" className="button secondary"><History size={17} aria-hidden="true" />Version history</Link>} />
    {current.isPending ? <Loading>Loading roadmap…</Loading> : current.isError ? <ErrorNotice error={current.error} retry={() => void current.refetch()} /> :
      roadmap ? <RoadmapView roadmap={roadmap} editable /> :
      <EmptyState icon={Compass} title="Build your first roadmap">
        <p>{profile.data ? 'Get milestones for ' + profile.data.targetRole + ' based on your skills and weekly availability.' : 'A roadmap uses the goals and constraints from your career profile.'}</p>
        <ErrorNotice error={profile.error} retry={() => void profile.refetch()} />
        <ErrorNotice error={generate.error} />
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
        <RunProgress run={query.isError ? undefined : run} retry={retry} label="Building your roadmap…" />
        {status === 'succeeded' && <Loading>Opening your roadmap…</Loading>}
        {!inFlight && status !== 'succeeded' && !(status === 'failed' && run?.retryable) &&
          <button type="button" className="button primary" disabled={!profile.data || generate.isPending} onClick={() => profile.data && generate.mutate(profile.data.version)}>
            <Sparkles size={17} aria-hidden="true" />{generate.isPending ? 'Starting…' : 'Generate roadmap'}
          </button>}
      </EmptyState>}
    {!roadmap && !current.isPending && !current.isError && <CareerActivity />}
  </>;
}

const labels = { generated: 'Initial roadmap', milestone_progress: 'Milestone progress', ai_revision: 'Approved coach revision' };

export function VersionsPage() {
  const versions = useInfiniteQuery({
    queryKey: versionsKey, initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => request<{ versions: VersionSummary[] }>('/roadmap/versions' + searchPage(pageParam, 20), { signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const entries = versions.data?.pages.flatMap((page) => page.data.versions) ?? [];
  return <>
    <PageHeading title="Version history" description="Reopen a saved snapshot of your roadmap." actions={<Link to="/app" className="button secondary">Current roadmap</Link>} />
    {versions.isPending && <Loading />}
    <ErrorNotice error={versions.error} retry={() => void (versions.isFetchNextPageError ? versions.fetchNextPage() : versions.refetch())} />
    {!!entries.length && <ul className="card record-list">{entries.map((record) => <li key={record.version}>
      <Link to={'/app/versions/' + record.version}><span><strong>Version {record.version}</strong><span>{labels[record.change.type]} · {record.targetRole}</span></span><time dateTime={record.createdAt}>{formatDate(record.createdAt)}</time></Link>
    </li>)}</ul>}
    {!entries.length && versions.isSuccess && <EmptyState icon={History} title="No saved versions yet" />}
    {versions.hasNextPage && <button type="button" className="button secondary more" disabled={versions.isFetchingNextPage} onClick={() => void versions.fetchNextPage()}>Load older versions</button>}
  </>;
}

export function VersionPage() {
  const { version } = useParams();
  const snapshot = useQuery({
    queryKey: ['version', version],
    queryFn: async ({ signal }) => (await request<{ roadmap: RoadmapData }>('/roadmap/versions/' + version, { signal })).data.roadmap,
  });
  return <>
    <PageHeading title={'Roadmap version ' + version} description={snapshot.data && 'Saved ' + formatDate(snapshot.data.createdAt)} actions={<Link to="/app/versions" className="button secondary">Version history</Link>} />
    {snapshot.isPending && <Loading />}
    <ErrorNotice error={snapshot.error} retry={() => void snapshot.refetch()} />
    {snapshot.data && <RoadmapView roadmap={snapshot.data} editable={false} />}
  </>;
}
