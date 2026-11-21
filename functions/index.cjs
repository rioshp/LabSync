'use strict';

const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { createDomain, DomainError } = require('./domain.cjs');
const { createReviewWorker } = require('./review-worker.cjs');

if (admin.apps.length === 0) admin.initializeApp();

const db = admin.firestore();
const domain = createDomain({
  db,
  FieldValue,
  Timestamp,
  getAuthUser: async (uid) => {
    try {
      return await getAuth().getUser(uid);
    } catch (error) {
      if (error.code === 'auth/user-not-found') return null;
      throw error;
    }
  },
});
const reviewWorker = createReviewWorker({ db, FieldValue, Timestamp });

exports.mutate = onCall({ region: 'us-central1' }, async (request) => {
  try {
    return await domain.mutate(request.data, request);
  } catch (err) {
    if (err instanceof DomainError) throw new HttpsError(err.code, err.message);
    console.error('labsync_mutation_failed', {
      action: typeof request.data?.action === 'string' ? request.data.action : 'unknown',
      code: typeof err?.code === 'string' ? err.code : 'internal',
    });
    throw new HttpsError('internal', 'The request could not be completed. Try again.');
  }
});

exports.processReviewJobOnWrite = onDocumentWritten(
  { document: 'reviewJobs/{reviewId}', region: 'us-central1' },
  (event) =>
    reviewWorker.handleReviewJobEvent({
      reviewId: event.params.reviewId,
      before: event.data?.before,
      after: event.data?.after,
    }),
);

exports.retryDueReviewJobs = onSchedule(
  { schedule: 'every 1 minutes', region: 'us-central1' },
  () => reviewWorker.retryDueReviewJobs(),
);
