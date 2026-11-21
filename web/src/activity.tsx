import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { activityKey, request } from './api';
import { ErrorNotice, Loading } from './ui';
import './activity.css';

interface Activity {
  days: { date: string; count: number }[];
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
}

const month = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short' });
const date = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', dateStyle: 'full' });
const activityCount = (count: number) => count === 1 ? '1 activity' : count + ' activities';

function Heatmap({ days }: { days: Activity['days'] }) {
  const firstWeekday = new Date(days[0].date).getUTCDay();
  const weeks = Math.ceil((days.length + firstWeekday) / 7);
  const viewport = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState(days.at(-1)!.date);
  const index = days.findIndex((day) => day.date === selectedDate);
  const selected = index === -1 ? days.length - 1 : index;
  const labels: { week: number; label: string }[] = [];
  for (const [dayIndex, day] of days.entries()) {
    if (!day.date.endsWith('-01')) continue;
    const week = Math.floor((dayIndex + firstWeekday) / 7) + 1;
    if (week <= weeks - 1 && week - (labels.at(-1)?.week ?? -2) >= 3) {
      labels.push({ week, label: month.format(new Date(day.date)) });
    }
  }

  useLayoutEffect(() => {
    if (viewport.current) viewport.current.scrollLeft = viewport.current.scrollWidth;
  }, [days[0].date]);

  function move(event: KeyboardEvent<HTMLButtonElement>, from: number) {
    const deltas: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? days.length - 1 : from + deltas[event.key];
    if (!Number.isFinite(next)) return;
    event.preventDefault();
    const target = Math.max(0, Math.min(days.length - 1, next));
    setSelectedDate(days[target].date);
    viewport.current?.querySelector<HTMLButtonElement>('[data-day-index="' + target + '"]')?.focus();
  }

  const summary = date.format(new Date(days[selected].date)) + ' · ' + activityCount(days[selected].count);
  return <>
    <div className="heatmap-scroll" ref={viewport}>
      <div className="heatmap" style={{ gridTemplateColumns: 'auto repeat(' + weeks + ', minmax(13px, 1fr))' }}
        role="group" aria-label="Daily activity calendar. Use the arrow keys to move between dates.">
        {labels.map(({ week, label }) => <span className="heatmap-month" key={week} aria-hidden="true" style={{ gridColumn: week + 1, gridRow: 1 }}>{label}</span>)}
        {[[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].map(([weekday, label]) => <span className="heatmap-weekday" key={label}
          aria-hidden="true" style={{ gridColumn: 1, gridRow: Number(weekday) + 2 }}>{label}</span>)}
        {days.map((day, dayIndex) => {
          const slot = dayIndex + firstWeekday;
          const label = date.format(new Date(day.date)) + ', ' + activityCount(day.count);
          return <button key={day.date} type="button" className="heatmap-day" data-level={Math.min(day.count, 4)}
            data-day-index={dayIndex} tabIndex={selected === dayIndex ? 0 : -1} aria-label={label} title={label}
            aria-pressed={selected === dayIndex} aria-current={dayIndex === days.length - 1 ? 'date' : undefined}
            style={{ gridColumn: Math.floor(slot / 7) + 2, gridRow: slot % 7 + 2 }}
            onFocus={() => setSelectedDate(day.date)} onClick={() => setSelectedDate(day.date)}
            onKeyDown={(event) => move(event, dayIndex)} />;
        })}
      </div>
    </div>
    <div className="heatmap-footer">
      <p role="status">{summary}</p>
      <div className="heatmap-key" aria-label="Activity scale from no activity to four or more">
        <span>Less</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} data-level={level} aria-hidden="true" />)}<span>More</span>
      </div>
    </div>
  </>;
}

export function CareerActivity() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const query = useQuery({
    queryKey: [...activityKey, timeZone],
    queryFn: async ({ signal }) => (await request<Activity>('/activity?' + new URLSearchParams({ timeZone }), { signal })).data,
  });
  return <section className="card career-activity" aria-labelledby="career-activity-title">
    <header className="activity-heading"><div><h2 id="career-activity-title">Your career journey</h2>
      <p>Last 365 days on Arcshift</p></div><CalendarDays aria-hidden="true" size={22} /></header>
    {query.isPending && <Loading>Loading activity…</Loading>}
    <ErrorNotice error={query.error} retry={() => void query.refetch()} />
    {query.data && <>
      <dl className="activity-metrics">
        <div><dt>Active days</dt><dd>{query.data.activeDays}</dd></div>
        <div><dt>Current streak</dt><dd>{query.data.currentStreak} {query.data.currentStreak === 1 ? 'day' : 'days'}</dd></div>
        <div><dt>Longest streak</dt><dd>{query.data.longestStreak} {query.data.longestStreak === 1 ? 'day' : 'days'}</dd></div>
      </dl>
      <Heatmap days={query.data.days} />
    </>}
  </section>;
}
