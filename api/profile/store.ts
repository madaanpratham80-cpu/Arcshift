import { ObjectId, type Collection, type Db } from 'mongodb';
import { CAREER_PROFILES_COLLECTION, isDuplicateKey } from '../db/mongo.ts';
import { ApiError } from '../http-errors.ts';

export interface CareerProfileFields {
  background: string;
  skills: string[];
  targetRole: string;
  hoursPerWeek: number;
  constraints: { budget?: string; notes?: string };
}

interface CareerProfile extends CareerProfileFields {
  _id: ObjectId;
  userId: ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  roadmapGuard?: number;
}

export function careerProfiles(db: Db) {
  return db.collection<CareerProfile>(CAREER_PROFILES_COLLECTION);
}

export function publicProfile(profile: CareerProfile | null) {
  if (!profile) return null;
  return {
    background: profile.background,
    skills: profile.skills,
    targetRole: profile.targetRole,
    hoursPerWeek: profile.hoursPerWeek,
    constraints: profile.constraints,
    version: profile.version,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function profileVersionConflict() {
  return new ApiError(409, 'PROFILE_VERSION_CONFLICT',
    'Your profile has changed. Reload it before saving again.');
}

export async function saveCareerProfile(
  profiles: Collection<CareerProfile>,
  userId: ObjectId,
  expectedVersion: number,
  fields: CareerProfileFields,
): Promise<CareerProfile> {
  if (expectedVersion === 0) {
    const now = new Date();
    const profile: CareerProfile = {
      _id: new ObjectId(), userId, ...fields, version: 1, createdAt: now, updatedAt: now,
    };

    try {
      await profiles.insertOne(profile);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      throw profileVersionConflict();
    }
    return profile;
  }

  const updated = await profiles.findOneAndUpdate(
    { userId, version: expectedVersion },
    { $set: fields, $inc: { version: 1 }, $currentDate: { updatedAt: true } },
    { returnDocument: 'after' },
  );
  if (!updated) throw profileVersionConflict();
  return updated;
}
