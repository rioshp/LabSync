import type { Timestamp } from '@react-native-firebase/firestore';

export type SessionStatus = 'upcoming' | 'open' | 'closed';

export type Session = {
  id: string;
  classId: string;
  className: string;
  practicum: string;
  module: string;
  room: string;
  date: string;
  startTime: string;
  endTime: string;
  status: SessionStatus;
  assistantId: string;
  openedAt: Timestamp | null;
};
