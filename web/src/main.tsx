import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AdminPage } from './admin';
import { MissingPage, TermsPage } from './public-pages';
import { ApiError } from './api';
import { AuthPage, Landing, RequireSession, SessionListener, Workspace } from './auth';
import { CoachPage, ConversationsPage } from './coach';
import { ProfilePage } from './profile';
import { ProposalPage } from './proposal';
import { RoadmapPage, VersionPage, VersionsPage } from './roadmap';
import './styles.css';

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: (count, error) => count < 1 && (!(error instanceof ApiError) || error.status >= 500) },
  },
});

function App() {
  return <QueryClientProvider client={client}><BrowserRouter>
    <SessionListener />
    <Routes>
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<AuthPage key="login" mode="login" />} />
      <Route path="/signup" element={<AuthPage key="signup" mode="signup" />} />
      <Route element={<RequireSession />}>
        <Route path="/onboarding" element={<ProfilePage onboarding />} />
        <Route path="/app" element={<Workspace />}>
          <Route index element={<RoadmapPage />} />
          <Route path="coach/:id?" element={<CoachPage />} />
          <Route path="history" element={<ConversationsPage />} />
          <Route path="settings" element={<ProfilePage />} />
          <Route path="versions" element={<VersionsPage />} />
          <Route path="versions/:version" element={<VersionPage />} />
          <Route path="proposals/:id" element={<ProposalPage />} />
        </Route>
      </Route>
      <Route path="*" element={<MissingPage />} />
    </Routes>
  </BrowserRouter></QueryClientProvider>;
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);
