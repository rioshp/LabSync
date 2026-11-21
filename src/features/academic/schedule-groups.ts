import type { AcademicSession } from './types';

export function groupSchedule(sessions: AcademicSession[], now = Date.now()) {
  const open = sessions.filter((session) => session.status === 'open');
  const scheduled = sessions.filter((session) => session.status === 'scheduled');
  const upcoming = scheduled.filter((session) => session.startsAt.toMillis() >= now);
  const overdue = scheduled.filter((session) => session.startsAt.toMillis() < now).reverse();
  const past = sessions
    .filter((session) => session.status === 'closed' || session.status === 'cancelled')
    .sort((a, b) => b.startsAt.toMillis() - a.startsAt.toMillis());

  return { open, upcoming, overdue, past };
}
