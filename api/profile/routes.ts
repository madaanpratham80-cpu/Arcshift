import express from 'express';
import type { Db } from 'mongodb';
import { z } from 'zod';
import type { AuthConfig } from '../auth/config.ts';
import { createSessionManager } from '../auth/sessions.ts';
import { ApiError } from '../http-errors.ts';
import { assertAppOrigin, requireDatabaseReady } from '../request-guards.ts';
import { careerProfiles, publicProfile, saveCareerProfile } from './store.ts';

function uniqueSkills(skills: string[]) {
  const seen = new Set<string>();
  return skills.filter((skill) => {
    const key = skill.normalize('NFKC').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const profileText = z.string().trim().refine((value) => value.isWellFormed(), 'Use valid text.');
const skillsSchema = z.array(profileText.min(1).max(80)).max(50).transform(uniqueSkills);
const constraintsSchema = z.strictObject({
  budget: profileText.max(160).optional(),
  notes: profileText.max(1_000).optional(),
}).default({}).transform(({ budget, notes }) => ({
  ...(budget ? { budget } : {}),
  ...(notes ? { notes } : {}),
}));

const profileSchema = z.strictObject({
  expectedVersion: z.int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  background: profileText.min(1).max(4_000),
  skills: skillsSchema,
  targetRole: profileText.min(1).max(120),
  hoursPerWeek: z.number().min(0).max(168),
  constraints: constraintsSchema,
});

export function createProfileRouter(db: Db, config: AuthConfig, checkReadiness: () => Promise<boolean>) {
  const router = express.Router();
  const profiles = careerProfiles(db);
  const sessions = createSessionManager(db, config);

  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (request.method === 'PUT') assertAppOrigin(request, config.origin);
    next();
  });
  router.use(requireDatabaseReady(checkReadiness));
  router.use(async (request, response, next) => {
    const { account } = await sessions.authenticate(request);
    response.locals.profileOwner = account._id;
    next();
  });

  router.get('/', async (_request, response) => {
    const profile = await profiles.findOne({ userId: response.locals.profileOwner });
    response.json({ data: { profile: publicProfile(profile) } });
  });

  router.put('/', express.json({ limit: '64kb' }), async (request, response) => {
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error);
      throw new ApiError(400, 'VALIDATION_FAILED', 'Review the profile fields and try again.', fieldErrors);
    }

    const { expectedVersion, ...fields } = parsed.data;
    const saved = await saveCareerProfile(profiles, response.locals.profileOwner, expectedVersion, fields);
    response.status(expectedVersion === 0 ? 201 : 200).json({ data: { profile: publicProfile(saved) } });
  });

  return router;
}
