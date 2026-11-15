import type { Timestamp } from '@react-native-firebase/firestore';

export type Role = 'asisten' | 'praktikan';

type Profile = {
  name: string;
  createdAt: Timestamp;
};

export type UserProfile = Profile & (
  | { role: 'asisten'; nim?: never }
  | { role: 'praktikan'; nim: string }
);

