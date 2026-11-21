import express from 'express';
import type { Db } from 'mongodb';
import type { AuthConfig } from './auth/config.ts';
import { createSessionManager } from './auth/sessions.ts';
import { ApiError } from './http-errors.ts';
import { requireDatabaseReady } from './request-guards.ts';

const dayMilliseconds = 86_400_000;
const daysInWindow = 365;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function calendar(timeZone: unknown, now: Date) {
  if (typeof timeZone !== 'string' || timeZone.length > 100 || !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(timeZone)) throw invalidZone();
  try {
    const format = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const parts = Object.fromEntries(format.formatToParts(now).map(({ type, value }) => [type, value]));
    return { today: parts.year + '-' + parts.month + '-' + parts.day, timeZone: format.resolvedOptions().timeZone };
  } catch {
    throw invalidZone();
  }
}

function invalidZone() {
  return new ApiError(400, 'INVALID_TIME_ZONE', 'Use a valid calendar time zone.');
}

export function summarizeActivity(today: string, counts: ReadonlyMap<string, number>) {
  const first = Date.parse(today) - (daysInWindow - 1) * dayMilliseconds;
  const days = Array.from({ length: daysInWindow }, (_, index) => {
    const date = isoDay(new Date(first + index * dayMilliseconds));
    return { date, count: counts.get(date) ?? 0 };
  });
  let activeDays = 0;
  let longestStreak = 0;
  let streak = 0;
  let currentStreak = 0;
  for (const { date, count } of days) {
    if (count > 0) {
      activeDays++;
      streak++;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      if (date === today) currentStreak = streak;
      streak = 0;
    }
  }
  return { days, activeDays, currentStreak: currentStreak || streak, longestStreak };
}

export function createActivityRouter(db: Db, config: AuthConfig, checkReadiness: () => Promise<boolean>) {
  const router = express.Router();
  const sessions = createSessionManager(db, config);
  const streaks = db.collection('activityStreaks');
  router.get('/', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  }, requireDatabaseReady(checkReadiness), async (request, response) => {
    const { account } = await sessions.authenticate(request);
    const now = new Date();
    const { today, timeZone } = calendar(request.query.timeZone ?? 'UTC', now);
    // The full preceding UTC day includes the earliest local midnight in the window.
    const from = new Date(Date.parse(today) - daysInWindow * dayMilliseconds);
    const filter = { userId: account._id, createdAt: { $gte: from, $lte: now } };
    async function group(name: string, extra = {}) {
      return db.collection(name).aggregate<{ _id: string; count: number }>([
        { $match: { ...filter, ...extra } },
        { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: timeZone } }, count: { $sum: 1 } } },
      ]).toArray();
    }
    const groups = await Promise.all([
      group('careerProfiles'), group('roadmapVersions'), group('messages', { role: 'user' }),
    ]);
    const counts = new Map<string, number>();
    for (const { _id, count } of groups.flat()) counts.set(_id, (counts.get(_id) ?? 0) + count);
    const { days, ...totals } = summarizeActivity(today, counts);
    const snapshot = { ...totals, timeZone, throughDate: today, computedAt: now };
    // A slower request must not replace a snapshot based on more recent activity.
    await streaks.updateOne({ _id: account._id }, [
      { $set: { snapshot: {
        $cond: [{ $lt: [{ $ifNull: ['$snapshot.computedAt', new Date(0)] }, now] }, { $literal: snapshot }, '$snapshot'],
      } } },
    ], { upsert: true });
    response.json({ data: { days, ...totals, timeZone } });
  });
  return router;
}
