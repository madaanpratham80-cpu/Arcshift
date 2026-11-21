import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Check, ChevronDown, Circle, Compass, History, LayoutDashboard, LogOut, MessageSquare, Settings2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { errorMessage, readSession, request, sessionExpired, sessionKey, sessionQuery } from './api';
import { Brand, ErrorNotice, Loading } from './ui';

export function SessionListener() {
  const client = useQueryClient();
  useEffect(() => {
    function clear() {
      void client.cancelQueries();
      client.setQueryData(sessionKey, null);
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    }
    window.addEventListener(sessionExpired, clear);
    return () => window.removeEventListener(sessionExpired, clear);
  }, [client]);
  return null;
}

export function RequireSession() {
  const session = useQuery(sessionQuery);
  const location = useLocation();
  if (session.isPending) return <Loading>Checking your session…</Loading>;
  if (session.isError) return <main className="standalone"><ErrorNotice error={session.error} retry={() => void session.refetch()} /></main>;
  if (!session.data) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  const onboarding = location.pathname === '/onboarding';
  if (!session.data.onboardingComplete && !onboarding) return <Navigate to="/onboarding" replace />;
  if (session.data.onboardingComplete && onboarding) return <Navigate to="/app" replace />;
  return <Outlet />;
}

const options = [
  { path: '/app', label: 'Roadmap', icon: LayoutDashboard },
  { path: '/app/coach', label: 'AI Coach', icon: MessageSquare },
  { path: '/app/history', label: 'History', icon: History },
  { path: '/app/settings', label: 'Settings', icon: Settings2 },
];

export function Workspace() {
  const session = useQuery(sessionQuery);
  const client = useQueryClient();
  const navigate = useNavigate();
  const signOut = useMutation({
    mutationFn: () => request('/auth/logout', { method: 'POST', renew: false }),
    onSuccess: async () => {
      await client.cancelQueries();
      client.setQueryData(sessionKey, null);
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
      navigate('/login', { replace: true });
    },
  });
  const email = session.data?.user.email ?? '';
  return <div className="workspace">
    <a className="skip" href="#main">Skip to content</a>
    <header className="member-header">
      <Brand to="/app" />
      <nav aria-label="Workspace">{options.map(({ path, label, icon: Icon }) =>
        <NavLink key={path} to={path} end={path === '/app'}><Icon size={20} aria-hidden="true" /><span>{label}</span></NavLink>
      )}</nav>
      <div className="member-account">
        <div className="account-id"><span className="avatar">{email.slice(0, 1).toUpperCase()}</span><span title={email}>{email}</span></div>
        <button type="button" className="icon-button sign-out" title="Sign out" aria-label="Sign out" disabled={signOut.isPending} onClick={() => signOut.mutate()}><LogOut size={19} aria-hidden="true" /></button>
      </div>
    </header>
    <main className="workspace-main" id="main">
      <ErrorNotice error={signOut.error} retry={() => signOut.mutate()} />
      <Outlet />
    </main>
  </div>;
}

function Illustration() {
  return <div className="illustration" aria-label="Example career roadmap">
    <div className="illustration-top"><span className="feature-icon"><Compass size={23} aria-hidden="true" /></span><div><span>Example roadmap</span><strong>Product Designer</strong></div></div>
    <div className="illustration-meter"><span>Plan progress</span><strong>1 of 3 complete</strong><span className="sample-track"><i /></span></div>
    <div className="illustration-list">
      <div><Check size={19} aria-hidden="true" /><span>Audit your portfolio</span></div>
      <div><Circle size={16} aria-hidden="true" /><span>Build a focused case study</span></div>
      <div><Circle size={16} aria-hidden="true" /><span>Practice your walkthrough</span></div>
    </div>
  </div>;
}

export function Landing() {
  const [params] = useSearchParams();
  const outcome = params.get('auth');
  if (outcome === 'google_signed_in') return <Navigate to="/app" replace />;
  if (outcome === 'google_linked') return <Navigate to="/app/settings?linked=1" replace />;
  if (outcome === 'google_link_conflict') return <Navigate to="/app/settings?auth=google_link_conflict" replace />;
  if (outcome === 'google_failed' || outcome === 'google_link_required') {
    return <Navigate to={'/login?auth=' + outcome} replace />;
  }
  return <div className="public-site">
    <header className="public-header"><Brand /><Link className="button secondary" to="/login">Sign in</Link></header>
    <main>
      <section className="landing-hero">
        <div className="landing-copy">
          <h1>Build a plan for your <em>next role.</em></h1>
          <p>Turn your skills, goals, and available time into a career roadmap you can follow, track, and adjust with an AI coach.</p>
          <Link className="button primary" to="/signup">Create your roadmap</Link>
        </div>
        <div className="illustration-shell"><Illustration /></div>
      </section>
      <section className="landing-features" aria-label="What you can do">
        <article><Compass aria-hidden="true" /><h2>Find your next step</h2><p>Get milestones based on your target role and the time you can commit.</p></article>
        <article><Sparkles aria-hidden="true" /><h2>Work through blockers</h2><p>Ask your coach for feedback and review proposed changes before applying them.</p></article>
        <article><BookOpen aria-hidden="true" /><h2>Keep a record</h2><p>Save evidence for milestones and revisit earlier versions of your roadmap.</p></article>
      </section>
    </main>
    <footer className="public-footer"><Link to="/terms">Terms and Conditions</Link></footer>
  </div>;
}

export function PublicFrame({ children }: { children: ReactNode }) {
  return <div className="public-site"><header className="public-header"><Brand /></header><main className="public-frame">{children}</main></div>;
}

function visitGoogle({ authorizationUrl }: { authorizationUrl: string }) {
  const url = new URL(authorizationUrl);
  if (url.origin !== 'https://accounts.google.com') throw new Error('Unexpected Google sign-in destination.');
  window.location.assign(url.href);
}

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const [warning, setWarning] = useState('');
  const adminSignIn = params.get('next') === 'admin';
  const auth = useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      await request('/auth/' + (signup ? 'register' : 'login'), { method: 'POST', body, renew: false });
      const session = await readSession();
      if (!session) throw new Error('Missing session');
      return session;
    },
    onSuccess: async (session) => {
      await client.cancelQueries();
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
      client.setQueryData(sessionKey, session);
      const from: unknown = location.state?.from;
      const safeFrom = typeof from === 'string' && /^\/app(?:[/?]|$)/.test(from) ? from : '/app';
      navigate(session.onboardingComplete ? safeFrom : '/onboarding', { replace: true });
    },
  });
  const google = useMutation({
    mutationFn: async () => visitGoogle((await request<{ authorizationUrl: string }>(adminSignIn ? '/auth/google/start?next=admin' : '/auth/google/start', { renew: false })).data),
  });

  const outcome = params.get('auth');
  const oauthMessage = outcome === 'google_link_required'
    ? 'Sign in with your password, then connect Google in Settings.'
    : outcome === 'google_failed' ? 'Google sign-in could not finish. Try again.' : '';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const body = { email: String(fields.get('email')), password: String(fields.get('password')) };
    if ((signup && [...body.password].length < 15) || new TextEncoder().encode(body.password).byteLength > 72) {
      setWarning(signup ? 'Use at least 15 characters and up to 72 bytes.' : 'Use a password up to 72 bytes.');
      return;
    }
    setWarning('');
    google.reset();
    setParams({}, { replace: true, state: location.state });
    auth.mutate(body);
  }

  return <PublicFrame><section className="card auth-card">
    <h1>{signup ? 'Create your account' : 'Sign in'}</h1>
    <p className="muted">{signup ? 'Start building your career roadmap.' : 'Continue working on your career roadmap.'}</p>
    {oauthMessage && <div className="notice danger" role="alert">{oauthMessage}</div>}
    <button type="button" className="button secondary full" onClick={() => google.mutate()} disabled={google.isPending || auth.isPending}>
      <span className="google-icon" aria-hidden="true">G</span>{google.isPending ? 'Connecting…' : 'Continue with Google'}
    </button>
    <div className="form-divider"><span>or use email</span></div>
    <form className="stack" onSubmit={submit}>
      <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <label>Password<input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 15 : 1} />
        {signup && <small>At least 15 characters.</small>}
      </label>
      {warning && <div className="notice danger" role="alert">{warning}</div>}
      <ErrorNotice error={auth.error ?? google.error} />
      <button className="button primary full" disabled={auth.isPending || google.isPending}>{auth.isPending ? 'Working…' : signup ? 'Create account' : 'Sign in'}</button>
    </form>
    <p className="auth-footer"><Link to="/terms">Terms and Conditions</Link></p>
    <p className="auth-footer">{signup ? 'Already have an account?' : 'New to Arcshift?'} <Link to={signup ? '/login' : '/signup'}>{signup ? 'Sign in' : 'Create an account'}</Link></p>
  </section></PublicFrame>;
}

export function AccountSettings() {
  const session = useQuery(sessionQuery);
  const [params] = useSearchParams();
  const [linkOpen, setLinkOpen] = useState(false);
  const google = useMutation({ mutationFn: async (password: string) => {
    const response = await request<{ authorizationUrl: string }>('/auth/google/link', { method: 'POST', body: { password } });
    visitGoogle(response.data);
  } });
  const user = session.data?.user;
  if (!user) return null;
  const connected = user.signInMethods.includes('google');

  return <section className="card settings-card">
    <h2>Account</h2><p className="muted">{user.email}</p>
    {params.get('auth') === 'google_link_conflict' && <div className="notice danger" role="alert">This Google account is already connected to another account.</div>}
    {params.get('linked') && connected && <div className="notice success" role="status">Google sign-in connected.</div>}
    <div className="setting-row">
      <div><strong>Google sign-in</strong><p>{connected ? 'Connected' : 'Connect your Google account for another way to sign in.'}</p></div>
      {!connected && user.signInMethods.includes('password') &&
        <button className="button secondary" type="button" onClick={() => setLinkOpen(!linkOpen)} aria-expanded={linkOpen}>Connect Google <ChevronDown size={16} aria-hidden="true" /></button>}
    </div>
    {linkOpen && !connected && <form className="stack account-form" onSubmit={(event) => {
      event.preventDefault();
      const password = String(new FormData(event.currentTarget).get('password'));
      google.mutate(password);
    }}>
      <label>Confirm password<input type="password" name="password" autoComplete="current-password" required /></label>
      {google.error && <div className="notice danger" role="alert">{errorMessage(google.error)}</div>}
      <button className="button primary" disabled={google.isPending}>{google.isPending ? 'Connecting…' : 'Continue to Google'}</button>
    </form>}
  </section>;
}
