import type { Timestamp } from '@react-native-firebase/firestore';

export type PermitStatus = 'pending' | 'approved' | 'rejected';

export type PermitSessionInfo = {
  practicum: string;
  module: string;
  className: string;
  date: string;
};

export type Permit = {
  id: string;
  sessionId: string;
  assistantId?: string;
  sessionInfo: PermitSessionInfo;
  studentId: string;
  studentName: string;
  nim: string;
  reason: string;
  status: PermitStatus;
  reviewedBy: string | null;
  reviewNote: string | null;
  submittedAt: Timestamp | null;
};
