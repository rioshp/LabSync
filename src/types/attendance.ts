import type { Timestamp } from '@react-native-firebase/firestore';

export type AttendanceSessionInfo = {
  practicum: string;
  module: string;
  className: string;
};

export type Attendance = {
  id: string;
  sessionId: string;
  sessionInfo: AttendanceSessionInfo;
  studentId: string;
  studentName: string;
  nim: string;
  checkedInAt: Timestamp | null;
};
