export interface User {
  id: string;
  email: string;
  signInMethods: ('google' | 'password')[];
}

export interface Session {
  user: User;
  onboardingComplete: boolean;
}

export interface ProfileFields {
  background: string;
  skills: string[];
  targetRole: string;
  hoursPerWeek: number;
  constraints: { budget?: string; notes?: string };
}

export interface Profile extends ProfileFields {
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type MilestoneStatus = 'todo' | 'in_progress' | 'completed';

export interface Milestone {
  id: string;
  title: string;
  action: string;
  rationale: string;
  completionCriterion: string;
  estimatedHours: number;
  status: MilestoneStatus;
  evidenceUrl: string | null;
  completedAt: string | null;
}

export interface Phase {
  id: string;
  title: string;
  milestones: Milestone[];
}

export type Change =
  | { type: 'generated' }
  | { type: 'milestone_progress'; milestoneId: string; fromStatus: MilestoneStatus; toStatus: MilestoneStatus; evidenceChanged: boolean }
  | { type: 'ai_revision'; rationale: string; proposalId: string; diff: RevisionDiff[] };

export interface Roadmap {
  id: string;
  version: number;
  profileVersion: number;
  targetRole: string;
  assumptions: string[];
  phases: Phase[];
  change: Change;
  createdAt: string;
  progress: { completedCount: number; milestoneCount: number; nextMilestoneId: string | null };
}

export type VersionSummary = Pick<Roadmap, 'version' | 'profileVersion' | 'targetRole' | 'createdAt' | 'change'>;
export type ProposalAvailability = 'not_requested' | 'available' | 'unavailable';

export interface Run {
  runId: string;
  kind: 'initial_roadmap' | 'coach_turn';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  retryable?: boolean;
  error?: { code: string; message: string };
  result?: {
    assistantMessageId?: string;
    roadmapId?: string;
    version?: number;
    proposalAvailability?: ProposalAvailability;
    proposalId?: string;
  };
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pendingRunId: string | null;
  lastRunId: string | null;
}

export interface Message {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  text: string;
  runId: string;
  createdAt: string;
  proposalAvailability?: ProposalAvailability;
  proposalId?: string;
}

export type RevisionDiff =
  | { type: 'target_changed'; before: string; after: string }
  | { type: 'assumptions_cleared'; before: string[]; after: [] }
  | { type: 'phase_added'; before: null; after: { id: string; title: string } }
  | { type: 'phase_removed'; before: { id: string; title: string }; after: null }
  | { type: 'milestone_added' | 'milestone_edited' | 'milestone_retired' | 'milestone_status';
      phaseId: string; milestoneId: string; before: Milestone | null; after: Milestone | null };

export interface Proposal {
  id: string;
  conversationId: string;
  baseRoadmapVersion: number;
  baseProfileVersion: number;
  rationale: string;
  diff: RevisionDiff[];
  status: 'pending' | 'applied' | 'stale';
  appliedVersion: number | null;
}
