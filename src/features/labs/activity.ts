import type { LabSchedule } from './types';

export function selectLabActivities(sessions: LabSchedule[], now: number) {
  const sorted = [...sessions].sort(
    (a, b) => a.startsAt.toMillis() - b.startsAt.toMillis() || a.id.localeCompare(b.id),
  );
  return {
    ongoing: sorted.filter((session) => session.status === 'open'),
    upcoming: sorted.filter(
      (session) => session.status === 'scheduled' && session.startsAt.toMillis() >= now,
    ),
  };
}
