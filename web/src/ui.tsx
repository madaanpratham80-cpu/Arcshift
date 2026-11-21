import { CircleAlert, Compass, LoaderCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { errorMessage } from './api';
import type { MilestoneStatus } from './types';

export const statusLabels: Record<MilestoneStatus, string> = {
  todo: 'To do', in_progress: 'In progress', completed: 'Complete',
};

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function Brand({ to = '/' }: { to?: string }) {
  return <Link className="brand" to={to} aria-label="Arcshift home">
    <span className="brand-icon"><Compass size={21} aria-hidden="true" /></span>
    <span>Arc<span className="brand-light">shift</span></span>
  </Link>;
}

export function PageHeading({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-heading">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>;
}

export function Loading({ children = 'Loading…' }: { children?: ReactNode }) {
  return <div className="loading" role="status"><LoaderCircle size={19} aria-hidden="true" />{children}</div>;
}

export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  return <div className="notice danger" role="alert">
    <CircleAlert size={18} aria-hidden="true" />
    <div>{errorMessage(error)}</div>
    {retry && <button type="button" className="text-button" onClick={retry}>Try again</button>}
  </div>;
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return <section className="card empty">
    <span className="feature-icon"><Icon size={24} aria-hidden="true" /></span>
    <h2>{title}</h2>
    {children}
  </section>;
}

export function Status({ value }: { value: MilestoneStatus }) {
  return <span className={'status ' + value}>{statusLabels[value]}</span>;
}

export function safeHref(value: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}
