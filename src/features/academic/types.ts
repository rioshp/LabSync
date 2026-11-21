import type { Timestamp } from '@react-native-firebase/firestore';

export type ResourceStatus = 'active' | 'archived';
export type ClassStatus = ResourceStatus;
export type AcademicSessionStatus = 'scheduled' | 'open' | 'closed' | 'cancelled';

export type Practicum = {
  id: string;
  assistantUid: string;
  name: string;
  status: ResourceStatus;
  activeClassCount: number;
  totalClassCount: number;
};

export type AcademicClass = {
  id: string;
  practicumId: string;
  practicumName: string;
  assistantUid: string;
  name: string;
  timeZone: string;
  status: ClassStatus;
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
  practicum: string;
  assistantUid: string;
  module: string;
  room: string;
  startsAt: Timestamp;
  endsAt: Timestamp;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  status: AcademicSessionStatus;
  openedAt: Timestamp | null;
  closedAt: Timestamp | null;
  cancelledAt: Timestamp | null;
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

export type ScheduleState = { sessions: AcademicSession[]; loading: boolean; offline: boolean };
