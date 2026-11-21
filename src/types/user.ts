export type Role = 'asisten' | 'praktikan';

type Profile = {
  displayName: string;
  /** Display name alias for screens written before the schema upgrade. */
  name: string;
  accountStatus: 'active' | 'disabled';
};

export type UserProfile = Profile & (
  | { role: 'asisten'; nim: null }
  | { role: 'praktikan'; nim: string }
);
