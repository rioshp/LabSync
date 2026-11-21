export async function firestoreSession() {
  const { auth, db } = await import('./firebase');
  const user = auth.currentUser;
  if (!user) throw new Error('Silakan masuk lagi.');
  return { db, user, uid: user.uid };
}

export function readId(value: unknown, label: string) {
  if (typeof value !== 'string' || !value || value.includes('/')) {
    throw new Error(`${label} tidak valid.`);
  }
  return value;
}

export function createId(uid: string, value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new Error('Permintaan tidak valid. Buka kembali formulir.');
  }
  return `${uid}~${value}`;
}

export function readText(value: unknown, label: string, min: number, max: number) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max) {
    throw new Error(`${label} harus berisi ${min}–${max} karakter.`);
  }
  return text;
}

export function readNim(value: unknown) {
  const nim = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z0-9][A-Z0-9-]{0,29}$/.test(nim)) {
    throw new Error('NIM harus diawali huruf atau angka dan boleh memuat tanda hubung.');
  }
  return nim;
}
