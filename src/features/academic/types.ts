import type { Timestamp } from '@react-native-firebase/firestore';

export type AcademicSessionStatus = 'scheduled' | 'open' | 'closed' | 'cancelled';

export type AcademicClass = {
  id: string;
  name: string;
  timeZone: string;
  status: 'active' | 'archived';
  unfinishedSessionCount: number;
};

export type Enrollment = {
  id: string;
  classId: string;
  assistantUid: string;
  studentUid: string;
  studentNameSnapshot: string;
  nimSnapshot: string;
  status: 'active' | 'removed';
};

export type AcademicSession = {
  id: string;
  classId: string;
  className: string;
  module: string;
  room: string;
  labId?: string;
  startsAt: Timestamp;
  endsAt: Timestamp;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  status: AcademicSessionStatus;
};

export type AttendanceRecord = {
  id: string;
  studentUid: string;
  studentNameSnapshot: string;
  nimSnapshot: string;
  checkedInAt: Timestamp;
};

export type ReviewSummary = {
  id: string;
  totalSubmitted: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  failedCount: number;
  pendingCount: number;
};

export type ScheduleState = { sessions: AcademicSession[]; loading: boolean };
