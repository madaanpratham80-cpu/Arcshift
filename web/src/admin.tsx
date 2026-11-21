import { useQuery } from '@tanstack/react-query';
import { Activity, ClipboardList, LayoutDashboard, MessageSquare, RefreshCw, Route, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router';
import { ApiError, request } from './api';
import { PublicFrame } from './auth';
import { Brand, ErrorNotice, Loading } from './ui';
import './admin.css';

type JobStatus = 'succeeded' | 'running' | 'queued' | 'failed';

interface Overview {
  accounts: number;
  profiles: number;
  roadmaps: number;
  conversations: number;
  activity: Array<{ date: string; accounts: number; roadmaps: number }>;
  jobs: Record<JobStatus, number>;
  updatedAt: string;
}

const cards = [
  { key: 'accounts', label: 'Accounts', icon: Users },
  { key: 'profiles', label: 'Career profiles', icon: ClipboardList },
  { key: 'roadmaps', label: 'Roadmaps', icon: Route },
  { key: 'conversations', label: 'Conversations', icon: MessageSquare },
] as const;

const statuses = [
  { key: 'succeeded', label: 'Succeeded', color: '#3fd9ae' },
  { key: 'running', label: 'Running', color: '#8f9fff' },
  { key: 'queued', label: 'Queued', color: '#f1b17f' },
  { key: 'failed', label: 'Failed', color: '#fb8596' },
] as const;

const number = new Intl.NumberFormat();
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const shortTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function ActivityChart({ activity }: { activity: Overview['activity'] }) {
  const step = Math.max(1, Math.ceil(Math.max(...activity.map(({ accounts, roadmaps }) => Math.max(accounts, roadmaps))) / 4));
  const ticks = [4, 3, 2, 1, 0].map((value) => value * step);
  const peak = ticks[0];
  return <section className="ops-panel ops-activity" id="activity" aria-labelledby="activity-title">
    <div className="ops-panel-head"><div><h2 id="activity-title">Workspace activity</h2><p>Accounts created and roadmaps generated</p></div><span className="ops-range">Last 14 days</span></div>
    <div className="ops-chart" aria-hidden="true">
      <div className="ops-ticks">{ticks.map((value) => <span key={value}>{number.format(value)}</span>)}</div>
      <div className="ops-plot">
        <div className="ops-guides">{ticks.map((value) => <i key={value} />)}</div>
        {activity.map(({ date, accounts, roadmaps }) => <div key={date} className="ops-day"
          title={shortDate.format(new Date(date)) + ' · ' + accounts + ' accounts · ' + roadmaps + ' roadmaps'}>
          <span className="ops-pair">
            <i style={{ height: accounts / peak * 100 + '%' }} />
            <i style={{ height: roadmaps / peak * 100 + '%' }} />
          </span><small>{shortDate.format(new Date(date))}</small>
        </div>)}
      </div>
    </div>
    <div className="ops-key"><span><i />Accounts</span><span><i />Roadmaps</span></div>
    <details className="ops-daily">
      <summary>View daily totals</summary>
      <table><thead><tr><th scope="col">Date</th><th scope="col">Accounts</th><th scope="col">Roadmaps</th></tr></thead>
        <tbody>{activity.map(({ date, accounts, roadmaps }) => <tr key={date}><th scope="row">{shortDate.format(new Date(date))}</th><td>{number.format(accounts)}</td><td>{number.format(roadmaps)}</td></tr>)}</tbody></table>
    </details>
  </section>;
}

function JobChart({ jobs }: { jobs: Overview['jobs'] }) {
  const total = Object.values(jobs).reduce((sum, count) => sum + count, 0);
  let start = 0;
  const segments = statuses.filter(({ key }) => jobs[key] > 0).map(({ key, color }) => {
    const end = start + jobs[key] / total * 100;
    const segment = color + ' ' + start + '% ' + end + '%';
    start = end;
    return segment;
  });
  return <section className="ops-panel ops-jobs" id="ai-runs" aria-labelledby="jobs-title">
    <div className="ops-panel-head"><div><h2 id="jobs-title">AI runs</h2><p>Roadmap and coach jobs by status</p></div><Activity size={20} aria-hidden="true" /></div>
    <div className="ops-ring" style={{ background: total ? 'conic-gradient(' + segments.join(',') + ')' : undefined }} aria-hidden="true">
      <div><strong>{number.format(total)}</strong><span>Total runs</span></div>
    </div>
    <ul className="ops-breakdown">{statuses.map(({ key, label, color }) => <li key={key}><span><i style={{ background: color }} />{label}</span><strong>{number.format(jobs[key])}</strong></li>)}</ul>
  </section>;
}

export function AdminPage() {
  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async ({ signal }) => (await request<Overview>('/admin/overview', { signal, notifyExpiry: false })).data,
  });

  if (overview.isError && overview.error instanceof ApiError && [401, 403].includes(overview.error.status)) {
    return <PublicFrame><section className="card auth-card"><ShieldCheck aria-hidden="true" />
      <h1>Arcshift admin</h1><p className="muted">Open this dashboard with the authorized Google account.</p>
      <Link className="button primary" to="/login?next=admin">Sign in to admin</Link>
    </section></PublicFrame>;
  }
  const data = overview.isError ? undefined : overview.data;
  return <div className="ops-shell">
    <a className="skip" href="#admin-main">Skip to content</a>
    <aside className="ops-nav">
      <Brand to="/admin" />
      <nav aria-label="Admin dashboard">
        <Link to="/admin" aria-current="page"><LayoutDashboard size={18} aria-hidden="true" />Overview</Link>
        {data && <>
          <a href="#activity"><Activity size={18} aria-hidden="true" />Workspace activity</a>
          <a href="#ai-runs"><ClipboardList size={18} aria-hidden="true" />AI runs</a>
        </>}
      </nav>
      <div className="ops-nav-footer"><Link to="/app">Go to workspace</Link><Link to="/terms">Terms and Conditions</Link></div>
    </aside>
    <main className="ops-main" id="admin-main">
      <header className="ops-title">
        <div><p><ShieldCheck size={16} aria-hidden="true" /> Admin</p><h1>Workspace overview</h1></div>
        <div className="ops-controls">
          {data && <time dateTime={data.updatedAt}>Updated {shortTime.format(new Date(data.updatedAt))}</time>}
          <button type="button" className="button ops-refresh" onClick={() => void overview.refetch()} disabled={overview.isFetching}>
            <RefreshCw size={16} aria-hidden="true" />{overview.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      {overview.isPending && <Loading>Loading admin dashboard…</Loading>}
      <ErrorNotice error={overview.error} retry={() => void overview.refetch()} />
      {data && <>
        <div className="ops-cards">{cards.map(({ key, label, icon: Icon }) => <section className="ops-panel ops-card" key={key}>
          <span className="ops-card-icon"><Icon size={19} aria-hidden="true" /></span>
          <h2>{label}</h2><p>{number.format(data[key])}</p>
        </section>)}</div>
        <div className="ops-panels"><ActivityChart activity={data.activity} /><JobChart jobs={data.jobs} /></div>
      </>}
    </main>
  </div>;
}
