export type Role = 'asisten' | 'praktikan';

type Profile = {
  displayName: string;
  accountStatus: 'active' | 'disabled';
};

export type UserProfile = Profile &
  ({ role: 'asisten'; nim: null } | { role: 'praktikan'; nim: string });
