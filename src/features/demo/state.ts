export const identities = [
  { id: 'assistant-demo', name: 'Dina', role: 'asisten' },
  { id: 'student-demo-1', name: 'Fajar', role: 'praktikan' },
  { id: 'student-demo-2', name: 'Ayu', role: 'praktikan' },
] as const;

export const fixtures = [
  {
    id: 'session-1',
    className: 'TI-2A',
    practicum: 'Pemrograman Mobile',
    title: 'Komponen dan tata letak',
    time: 'Senin, 09.00–10.30',
    room: 'Lab 1',
  },
  {
    id: 'session-2',
    className: 'TI-2A',
    practicum: 'Pemrograman Mobile',
    title: 'Navigasi aplikasi',
    time: 'Rabu, 13.00–14.30',
    room: 'Lab 2',
  },
] as const;

type Status = 'scheduled' | 'open' | 'closed';
export type DemoState = {
  status: Partial<Record<string, Status>>;
  attendance: { sessionId: string; studentId: string; time: number }[];
};
export type DemoAction =
  | { kind: 'open' | 'close'; actorId: string; sessionId: string }
  | { kind: 'checkIn'; actorId: string; sessionId: string; time: number };

export const initialDemo: DemoState = { status: {}, attendance: [] };

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  const actor = identities.find((item) => item.id === action.actorId);
  if (!actor || !fixtures.some((session) => session.id === action.sessionId)) return state;
  const status = state.status[action.sessionId] ?? 'scheduled';
  if (action.kind === 'checkIn') {
    if (
      actor.role !== 'praktikan' ||
      status !== 'open' ||
      state.attendance.some(
        (record) => record.sessionId === action.sessionId && record.studentId === actor.id,
      )
    )
      return state;
    return {
      ...state,
      attendance: [
        ...state.attendance,
        { sessionId: action.sessionId, studentId: actor.id, time: action.time },
      ],
    };
  }
  if (actor.role !== 'asisten') return state;
  if (
    (action.kind === 'open' && status !== 'scheduled') ||
    (action.kind === 'close' && status !== 'open')
  )
    return state;
  return {
    ...state,
    status: { ...state.status, [action.sessionId]: action.kind === 'open' ? 'open' : 'closed' },
  };
}
