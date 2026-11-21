export function firebaseErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String(error.code).split('/').at(-1) ?? '';
}
