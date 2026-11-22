import {
  doc,
  getDocFromServer,
  increment,
  runTransaction,
  serverTimestamp,
} from '@react-native-firebase/firestore';

import { firestoreSession, readId, readText } from './firestore-input';

import model from '../../functions/ai/model-edom.json';
import { createSentimentClassifier } from '../../functions/ai/sentiment';

const modelVersion = 'edom-linear-svc-v1-research-baseline';
type Sentiment = 'positive' | 'neutral' | 'negative';
type ReviewAccess = Record<string, { state: 'submitted' | 'ready' | 'waiting'; classId: string }>;

function classify(text: string): Sentiment | null {
  try {
    switch (createSentimentClassifier(model)(text).label) {
      case 'positive':
      case 'positif':
        return 'positive';
      case 'negative':
      case 'negatif':
        return 'negative';
      case 'neutral':
      case 'netral':
        return 'neutral';
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function getReviewAccess(fields: Record<string, unknown>) {
  const { db, uid } = await firestoreSession();
  if (!Array.isArray(fields.attendanceIds) || fields.attendanceIds.length > 20) {
    throw new Error('Pilih maksimal 20 catatan kehadiran.');
  }

  const ids = [...new Set(fields.attendanceIds.map((id) => readId(id, 'Presensi')))];
  const access: ReviewAccess = {};
  await Promise.all(
    ids.map(async (id) => {
      const attendance = (await getDocFromServer(doc(db, 'attendances', id))).data();
      if (!attendance || attendance.studentUid !== uid) return;
      const { classId, sessionId } = attendance;
      const review = (await getDocFromServer(doc(db, 'reviews', id))).data();
      if (review) {
        access[id] = { state: 'submitted', classId };
        return;
      }
      const session = (
        await getDocFromServer(doc(db, 'classes', classId, 'sessions', sessionId))
      ).data();
      const reviewable = session?.status === 'open' || session?.status === 'closed';
      access[id] = { state: reviewable ? 'ready' : 'waiting', classId };
    }),
  );
  return access;
}

export async function submitReview(fields: Record<string, unknown>) {
  const { db, uid } = await firestoreSession();
  const classId = readId(fields.classId, 'Kelas');
  const sessionId = readId(fields.sessionId, 'Sesi');
  const text = readText(fields.text, 'Ulasan', 10, 1000);

  const id = `${sessionId}~${uid}`;
  const ref = doc(db, 'reviews', id);
  const sentiment = classify(text);
  const analysisStatus = sentiment ? 'succeeded' : 'failed';
  return runTransaction(db, async (tx) => {
    const existing = (await tx.get(ref)).data();
    if (existing) return { id, analysisStatus: existing.analysisStatus };

    const attended = (await tx.get(doc(db, 'attendances', id))).data();
    const session = (await tx.get(doc(db, 'classes', classId, 'sessions', sessionId))).data();
    const reviewable = session?.status === 'open' || session?.status === 'closed';
    if (!attended || attended.classId !== classId || !reviewable) {
      throw new Error('Ulasan tersedia setelah kamu presensi pada sesi yang sudah dibuka.');
    }

    const timestamp = serverTimestamp();
    tx.set(ref, {
      classId,
      sessionId,
      assistantUid: attended.assistantUid,
      studentUid: uid,
      text,
      submittedAt: timestamp,
      analysisStatus,
      sentiment,
      modelVersion,
      analyzedAt: timestamp,
    });
    tx.set(
      doc(db, 'reviewSummaries', sessionId),
      {
        classId,
        assistantUid: attended.assistantUid,
        totalSubmitted: increment(1),
        positiveCount: increment(sentiment === 'positive' ? 1 : 0),
        neutralCount: increment(sentiment === 'neutral' ? 1 : 0),
        negativeCount: increment(sentiment === 'negative' ? 1 : 0),
        failedCount: increment(sentiment === null ? 1 : 0),
        updatedAt: timestamp,
      },
      { merge: true },
    );
    return { id, analysisStatus };
  });
}
