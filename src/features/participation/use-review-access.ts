import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { mutate, mutationError } from '@/lib/mutations';

type ReviewAccess = Record<string, { state: 'submitted' | 'ready' | 'waiting'; classId: string }>;

export function useReviewAccess(attendanceIds: string[], attempt = 0) {
  const key = JSON.stringify(attendanceIds);
  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    access: ReviewAccess | null;
    error: string | null;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      const ids: string[] = JSON.parse(key);
      if (!ids.length) return;

      let active = true;
      async function load() {
        const access: ReviewAccess = {};
        for (let offset = 0; offset < ids.length && active; offset += 20) {
          const batch = await mutate<ReviewAccess>('getReviewAccess', {
            attendanceIds: ids.slice(offset, offset + 20),
          });
          Object.assign(access, batch);
        }
        if (active) setResult({ key, attempt, access, error: null });
      }

      void load().catch((error) => {
        if (active) setResult({ key, attempt, access: null, error: mutationError(error) });
      });
      return () => {
        active = false;
      };
    }, [key, attempt]),
  );

  return result?.key === key && result.attempt === attempt ? result : { access: null, error: null };
}
