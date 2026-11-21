import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, profileKey, profileQuery, request, sessionKey } from './api';
import { AccountSettings, PublicFrame } from './auth';
import type { Profile, ProfileFields, Session } from './types';
import { ErrorNotice, Loading, PageHeading } from './ui';

function ProfileForm({ profile, onboarding, onSave, onEdit }: { profile: Profile | null; onboarding: boolean; onSave: () => void; onEdit: () => void }) {
  const client = useQueryClient();
  const skillInput = useId();
  const [skills, setSkills] = useState(profile?.skills ?? []);
  const [newSkill, setNewSkill] = useState('');
  const [warning, setWarning] = useState('');
  const saver = useMutation({
    mutationFn: async (fields: ProfileFields) => (await request<{ profile: Profile }>('/profile', {
      method: 'PUT', body: { ...fields, expectedVersion: profile?.version ?? 0 },
    })).data.profile,
    onSuccess: (updated) => {
      client.setQueryData(profileKey, updated);
      client.setQueryData<Session | null>(sessionKey, (value) => value ? { ...value, onboardingComplete: true } : value);
      onSave();
    },
  });
  const fields = saver.error instanceof ApiError ? saver.error.fieldErrors : undefined;
  const stale = saver.error instanceof ApiError && saver.error.code === 'PROFILE_VERSION_CONFLICT';

  function addSkill() {
    const value = newSkill.trim();
    if (!value) return;
    if (skills.length >= 50) {
      setWarning('You can save up to 50 skills.');
      return;
    }
    setWarning('');
    setSkills([...skills, value]);
    setNewSkill('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    const allSkills = newSkill.trim() ? [...skills, newSkill.trim()] : skills;
    if (allSkills.length > 50 || allSkills.some((skill) => skill.length > 80)) {
      setWarning('Enter up to 50 skills, each with 80 characters or fewer.');
      return;
    }
    setWarning('');
    onEdit();
    saver.mutate({
      background: value('background'), skills: allSkills, targetRole: value('targetRole'), hoursPerWeek: Number(value('hoursPerWeek')),
      constraints: { budget: value('budget'), notes: value('notes') },
    });
  }

  return <section className="card profile-card">
    <h2>{onboarding ? 'Your starting point' : 'Career profile'}</h2>
    <form className="stack" onSubmit={submit}>
      <label>Current background<textarea name="background" rows={3} maxLength={4000} required defaultValue={profile?.background} placeholder="Describe your experience, studies, or recent projects." />
        {fields?.background && <small className="error-text">{fields.background.join(' ')}</small>}
      </label>
      <div>
        <label htmlFor={skillInput}>Skills</label>
        {!!skills.length && <ul className="skills" aria-label="Added skills">{skills.map((skill, index) => <li key={index}>
          {skill}<button className="icon-button" type="button" aria-label={'Remove ' + skill} onClick={() => setSkills(skills.filter((_, position) => position !== index))}><X size={15} aria-hidden="true" /></button>
        </li>)}</ul>}
        <div className="skill-entry">
          <input id={skillInput} value={newSkill} onChange={(event) => setNewSkill(event.target.value)} placeholder="Add a skill" maxLength={80}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing && newSkill.trim()) {
                event.preventDefault();
                addSkill();
              }
            }} />
          <button className="button secondary" type="button" onClick={addSkill} disabled={!newSkill.trim()}>Add skill</button>
        </div>
        {fields?.skills && <small className="error-text">{fields.skills.join(' ')}</small>}
      </div>
      <div className="form-grid">
        <label>Target role<input name="targetRole" defaultValue={profile?.targetRole} placeholder="Product Designer" maxLength={120} required />
          {fields?.targetRole && <small className="error-text">{fields.targetRole.join(' ')}</small>}
        </label>
        <label>Hours available each week<input name="hoursPerWeek" type="number" min="0" max="168" step="any" defaultValue={profile?.hoursPerWeek} placeholder="6" required />
          {fields?.hoursPerWeek && <small className="error-text">{fields.hoursPerWeek.join(' ')}</small>}
        </label>
      </div>
      <label>Budget <span className="optional">Optional</span><input name="budget" defaultValue={profile?.constraints.budget} maxLength={160} placeholder="Free resources only" /></label>
      <label>Other constraints <span className="optional">Optional</span><textarea name="notes" defaultValue={profile?.constraints.notes} rows={2} maxLength={1000} placeholder="For example, weekends only." /></label>
      {warning && <div className="notice danger" role="alert">{warning}</div>}
      <ErrorNotice error={saver.error} />
      {stale && <button className="button secondary" type="button" onClick={() => {
        saver.reset();
        void client.invalidateQueries({ queryKey: profileKey });
      }}>Load latest profile</button>}
      <div><button className="button primary" disabled={saver.isPending}>{saver.isPending ? 'Saving…' : onboarding ? 'Save and continue' : 'Save profile'}</button></div>
    </form>
  </section>;
}

export function ProfilePage({ onboarding = false }: { onboarding?: boolean }) {
  const profile = useQuery({ ...profileQuery, refetchOnWindowFocus: false });
  const [saved, setSaved] = useState(false);
  const body = <>
    <PageHeading title={onboarding ? 'Set up your career profile' : 'Settings'} description={onboarding ? 'Your coach uses these details to build a roadmap around your goal.' : 'Manage your sign-in and update the details your coach uses.'} />
    {saved && <div className="notice success" role="status">Career profile saved.</div>}
    {profile.isPending ? <Loading /> : profile.isError ? <ErrorNotice error={profile.error} retry={() => void profile.refetch()} /> :
      <ProfileForm key={profile.data?.version ?? 0} profile={profile.data} onboarding={onboarding} onSave={() => setSaved(true)} onEdit={() => setSaved(false)} />}
    {!onboarding && <AccountSettings />}
  </>;
  return onboarding ? <PublicFrame><div className="onboarding">{body}</div></PublicFrame> : body;
}
