import type { Timestamp } from '@react-native-firebase/firestore';
import type { AcademicSessionStatus } from '@/features/academic/types';
import type { Coordinates } from '@/lib/location';

export type Lab = Coordinates & {
  id: string;
  name: string;
  description: string;
  radiusMeters: number;
  status: 'active' | 'archived';
  assistantUid: string;
};

export type LabSchedule = {
  id: string;
  labId: string;
  classId: string;
  sessionId: string;
  assistantUid: string;
  practicumName: string;
  className: string;
  moduleTitle: string;
  startsAt: Timestamp;
  endsAt: Timestamp;
  timeZone: string;
  status: AcademicSessionStatus;
};
