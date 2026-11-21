import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { PublicFrame } from './auth';

export function MissingPage() {
  return <PublicFrame><section className="missing-page card" aria-labelledby="missing-title">
    <div className="missing-art" aria-hidden="true"><Compass /><span>404</span></div>
    <div className="missing-copy">
      <h1 id="missing-title">Page not found</h1>
      <p>Check the address or return to the Arcshift homepage.</p>
      <Link className="button primary" to="/">Back to home</Link>
      <Link to="/terms">Terms and Conditions</Link>
    </div>
  </section></PublicFrame>;
}

export function TermsPage() {
  return <PublicFrame><article className="card terms-page">
    <h1>Terms and Conditions</h1>
    <p className="terms-note">Draft for review before public release</p>
    <section><h2>Using Arcshift</h2><p>Arcshift helps you organize career goals, build a roadmap, and track your progress. Keep your sign-in secure and only submit content you have permission to use. Use the service in a way that respects other people’s privacy and complies with applicable law.</p></section>
    <section><h2>AI-generated guidance</h2><p>Roadmaps and coach replies can contain incomplete or inaccurate information. Check suggestions before acting on them. Review any proposed roadmap change before you approve it.</p></section>
    <section><h2>Your information</h2><p>Arcshift stores account and session information, your career profile, saved roadmaps, and coaching history. If you sign in with Google, Arcshift uses your verified email address and Google account identifier to identify your account.</p><p>When you generate a roadmap or ask the coach a question, Arcshift sends relevant profile and planning context to the configured AI provider. Enter information you’re comfortable sharing for that purpose.</p></section>
    <Link to="/">Back to home</Link>
  </article></PublicFrame>;
}
