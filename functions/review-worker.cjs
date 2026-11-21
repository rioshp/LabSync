'use strict';

const { createSentimentClassifier } = require('./ai/sentiment');
const model = require('./ai/model-edom.json');

// Bump this value whenever the bundled model or its preprocessing changes.
const MODEL_VERSION = 'edom-linear-svc-v1-research-baseline';
const MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15 * 1000;
const DEFAULT_BACKOFF_MS = 30 * 1000;
const DEFAULT_MAX_BACKOFF_MS = 10 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;

const MODEL_LABELS = Object.freeze({
  positive: 'positive',
  neutral: 'neutral',
  negative: 'negative',
  positif: 'positive',
  netral: 'neutral',
  negatif: 'negative',
});

class ReviewWorkerError extends Error {
  constructor(code, { retryable = true } = {}) {
    super(code);
    this.name = 'ReviewWorkerError';
    this.code = code;
    this.retryable = retryable;
  }
}

const defaultClassifier = createSentimentClassifier(model);

function normalizeLabel(result) {
  const candidate = typeof result === 'string' ? result : result?.label;
  return typeof candidate === 'string' ? MODEL_LABELS[candidate] || null : null;
}

function toMillis(value) {
  if (value == null) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function snapshotData(snapshot) {
  if (snapshot == null) return null;
  if (typeof snapshot.data === 'function') {
    if (snapshot.exists === false) return null;
    return snapshot.data() || null;
  }
  return snapshot;
}

function safeErrorCode(error) {
  const code = error && typeof error.code === 'string' ? error.code : '';
  switch (code) {
    case 'REVIEW_TEXT_INVALID':
    case 'MODEL_OUTPUT_INVALID':
    case 'MODEL_TIMEOUT':
    case 'MODEL_ERROR':
      return code;
    default:
      return 'MODEL_ERROR';
  }
}

function defaultTimestamp(Timestamp, date) {
  if (Timestamp && typeof Timestamp.fromDate === 'function') {
    return Timestamp.fromDate(date);
  }
  if (Timestamp && typeof Timestamp.fromMillis === 'function') {
    return Timestamp.fromMillis(date.getTime());
  }
  return date;
}

function defaultServerTimestamp(FieldValue) {
  if (FieldValue && typeof FieldValue.serverTimestamp === 'function') {
    return FieldValue.serverTimestamp();
  }
  return new Date();
}

function loggerCall(logger, method, payload) {
  if (logger && typeof logger[method] === 'function') {
    logger[method](payload);
  }
}

function calculateBackoffMs(attemptNumber, baseMs, maximumMs) {
  return Math.min(baseMs * 2 ** Math.max(0, attemptNumber - 1), maximumMs);
}

function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.resolve(promise);

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ReviewWorkerError('MODEL_TIMEOUT')), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function createReviewWorker({
  db,
  classify = defaultClassifier,
  FieldValue,
  Timestamp,
  now = () => new Date(),
  logger = console,
  config = {},
} = {}) {
  if (!db || typeof db.collection !== 'function' || typeof db.runTransaction !== 'function') {
    throw new TypeError('db must be a Firestore Admin instance');
  }
  if (typeof classify !== 'function') throw new TypeError('classify must be a function');

  const leaseMs = config.leaseMs ?? DEFAULT_LEASE_MS;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseBackoffMs = config.baseBackoffMs ?? DEFAULT_BACKOFF_MS;
  const maxBackoffMs = config.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const maxAttempts = config.maxAttempts ?? MAX_ATTEMPTS;
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  const serverTimestamp = () => defaultServerTimestamp(FieldValue);
  const timestampForDate = (date) => defaultTimestamp(Timestamp, date);
  const jobs = db.collection('reviewJobs');
  const reviews = db.collection('reviews');
  const summaries = db.collection('reviewSummaries');

  function readNow() {
    const value = now();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new TypeError('now must return a valid date');
    return date;
  }

  async function claimReviewJob(reviewId, { allowEarly = false } = {}) {
    const jobRef = jobs.doc(reviewId);
    const reviewRef = reviews.doc(reviewId);
    const claimNow = readNow();
    const claimNowMs = claimNow.getTime();
    const attemptId = `${claimNowMs.toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

    return db.runTransaction(async (transaction) => {
      const [jobSnapshot, reviewSnapshot] = await Promise.all([
        transaction.get(jobRef),
        transaction.get(reviewRef),
      ]);
      if (!jobSnapshot.exists || !reviewSnapshot.exists) {
        return { status: 'missing' };
      }

      const job = jobSnapshot.data();
      const review = reviewSnapshot.data();
      if (!['pending', 'processing'].includes(job.state)) {
        return { status: 'not_pending' };
      }

      const leaseUntilMs = toMillis(job.leaseUntil);
      if (job.state === 'processing' && leaseUntilMs != null && leaseUntilMs > claimNowMs) {
        return { status: 'leased' };
      }

      const nextAttemptAtMs = toMillis(job.nextAttemptAt);
      if (
        !allowEarly &&
        job.state === 'pending' &&
        nextAttemptAtMs != null &&
        nextAttemptAtMs > claimNowMs
      ) {
        return { status: 'not_due' };
      }

      const previousAttemptCount =
        Number.isInteger(job.attemptCount) && job.attemptCount >= 0 ? job.attemptCount : 0;
      // A failed job explicitly re-queued by an operator gets a fresh retry
      // window even if the caller did not reset attemptCount in its transaction.
      const attemptCount =
        allowEarly && job.state === 'pending' && previousAttemptCount >= maxAttempts
          ? 1
          : previousAttemptCount + 1;
      if (attemptCount > maxAttempts) return { status: 'attempts_exhausted' };

      transaction.update(jobRef, {
        state: 'processing',
        attemptCount,
        leaseUntil: timestampForDate(new Date(claimNowMs + leaseMs)),
        attemptId,
        nextAttemptAt: null,
        updatedAt: serverTimestamp(),
      });
      transaction.update(reviewRef, { analysisStatus: 'processing' });

      return {
        status: 'claimed',
        attemptId,
        attemptCount,
        text: review.text,
        review,
      };
    });
  }

  function getSummaryBase(review) {
    return {
      classId: review.classId,
      assistantUid: review.assistantUid,
      totalSubmitted: 1,
      positiveCount: 0,
      neutralCount: 0,
      negativeCount: 0,
      failedCount: 0,
    };
  }

  async function finalizeSuccess(reviewId, claim, sentiment) {
    const jobRef = jobs.doc(reviewId);
    const reviewRef = reviews.doc(reviewId);
    const summaryRef = summaries.doc(claim.review.sessionId);

    return db.runTransaction(async (transaction) => {
      const [jobSnapshot, reviewSnapshot, summarySnapshot] = await Promise.all([
        transaction.get(jobRef),
        transaction.get(reviewRef),
        transaction.get(summaryRef),
      ]);
      if (!jobSnapshot.exists || !reviewSnapshot.exists) return { status: 'missing' };
      const job = jobSnapshot.data();
      if (job.state !== 'processing' || job.attemptId !== claim.attemptId) {
        return { status: 'stale_attempt' };
      }

      transaction.update(jobRef, {
        state: 'succeeded',
        leaseUntil: null,
        attemptId: null,
        nextAttemptAt: null,
        lastErrorCode: null,
        updatedAt: serverTimestamp(),
      });
      transaction.update(reviewRef, {
        analysisStatus: 'succeeded',
        sentiment,
        modelVersion: MODEL_VERSION,
        analyzedAt: serverTimestamp(),
      });
      writeSummaryCounter(
        transaction,
        summaryRef,
        summarySnapshot,
        claim.review,
        `${sentiment}Count`,
      );
      return { status: 'succeeded' };
    });
  }

  async function finalizeFailure(reviewId, claim, error) {
    const jobRef = jobs.doc(reviewId);
    const reviewRef = reviews.doc(reviewId);
    const summaryRef = summaries.doc(claim.review.sessionId);
    const errorCode = safeErrorCode(error);
    const retryable = error?.retryable !== false;
    const shouldRetry = retryable && claim.attemptCount < maxAttempts;
    const retryDelayMs = shouldRetry
      ? calculateBackoffMs(claim.attemptCount, baseBackoffMs, maxBackoffMs)
      : null;

    const result = await db.runTransaction(async (transaction) => {
      const [jobSnapshot, reviewSnapshot, summarySnapshot] = await Promise.all([
        transaction.get(jobRef),
        transaction.get(reviewRef),
        transaction.get(summaryRef),
      ]);
      if (!jobSnapshot.exists || !reviewSnapshot.exists) return { status: 'missing' };
      const job = jobSnapshot.data();
      if (job.state !== 'processing' || job.attemptId !== claim.attemptId) {
        return { status: 'stale_attempt' };
      }

      if (shouldRetry) {
        const nextAttemptAt = new Date(readNow().getTime() + retryDelayMs);
        transaction.update(jobRef, {
          state: 'pending',
          leaseUntil: null,
          attemptId: null,
          nextAttemptAt: timestampForDate(nextAttemptAt),
          lastErrorCode: errorCode,
          updatedAt: serverTimestamp(),
        });
        transaction.update(reviewRef, {
          analysisStatus: 'pending',
          sentiment: null,
          modelVersion: null,
          analyzedAt: null,
        });
        return { status: 'retry_scheduled', retryDelayMs, errorCode };
      }

      transaction.update(jobRef, {
        state: 'failed',
        leaseUntil: null,
        attemptId: null,
        nextAttemptAt: null,
        lastErrorCode: errorCode,
        updatedAt: serverTimestamp(),
      });
      transaction.update(reviewRef, {
        analysisStatus: 'failed',
        sentiment: null,
        modelVersion: null,
        analyzedAt: serverTimestamp(),
      });
      writeSummaryCounter(transaction, summaryRef, summarySnapshot, claim.review, 'failedCount');
      return { status: 'failed', errorCode };
    });

    if (result.status === 'retry_scheduled') {
      loggerCall(logger, 'warn', {
        event: 'review_analysis_retry_scheduled',
        attemptNumber: claim.attemptCount,
        delayMs: result.retryDelayMs,
        errorCode: result.errorCode,
      });
    } else if (result.status === 'failed') {
      loggerCall(logger, 'error', {
        event: 'review_analysis_failed',
        attemptNumber: claim.attemptCount,
        errorCode: result.errorCode,
      });
    }
    return result;
  }

  function writeSummaryCounter(transaction, summaryRef, summarySnapshot, review, counterField) {
    const increment =
      FieldValue && typeof FieldValue.increment === 'function' ? FieldValue.increment(1) : 1;
    const patch = {
      [counterField]: increment,
      updatedAt: serverTimestamp(),
    };
    if (summarySnapshot.exists) {
      transaction.set(summaryRef, patch, { merge: true });
      return;
    }

    // The submission transaction normally creates this document. This fallback
    // keeps an already claimed review from being stranded if the summary is absent.
    transaction.set(summaryRef, {
      ...getSummaryBase(review),
      [counterField]: 1,
      updatedAt: serverTimestamp(),
    });
  }

  async function processReviewJob(reviewId, options = {}) {
    if (typeof reviewId !== 'string' || reviewId.length === 0) {
      throw new TypeError('reviewId must be a non-empty string');
    }

    const claim = await claimReviewJob(reviewId, options);
    if (claim.status !== 'claimed') return claim;

    if (typeof claim.text !== 'string' || claim.text.trim().length === 0) {
      return finalizeFailure(
        reviewId,
        claim,
        new ReviewWorkerError('REVIEW_TEXT_INVALID', { retryable: false }),
      );
    }

    let sentiment;
    try {
      const result = await withTimeout(classify(claim.text), timeoutMs);
      sentiment = normalizeLabel(result);
      if (!sentiment) {
        throw new ReviewWorkerError('MODEL_OUTPUT_INVALID', { retryable: false });
      }
    } catch (error) {
      return finalizeFailure(reviewId, claim, error);
    }

    const result = await finalizeSuccess(reviewId, claim, sentiment);
    if (result.status === 'succeeded') {
      loggerCall(logger, 'info', {
        event: 'review_analysis_succeeded',
        attemptNumber: claim.attemptCount,
        sentiment,
        modelVersion: MODEL_VERSION,
      });
    }
    return result;
  }

  async function handleReviewJobEvent({ reviewId, before, after } = {}) {
    const beforeJob = snapshotData(before);
    const afterJob = snapshotData(after);
    if (!reviewId || !afterJob || afterJob.state !== 'pending') {
      return { status: 'ignored' };
    }

    const created = beforeJob == null;
    const operatorRetry = beforeJob?.state === 'failed';
    if (!created && !operatorRetry) return { status: 'ignored' };

    return processReviewJob(reviewId, { allowEarly: true });
  }

  async function retryDueReviewJobs() {
    const dueTime = timestampForDate(readNow());
    const [pendingSnapshot, expiredSnapshot] = await Promise.all([
      jobs
        .where('state', '==', 'pending')
        .where('nextAttemptAt', '<=', dueTime)
        .limit(batchSize)
        .get(),
      jobs
        .where('state', '==', 'processing')
        .where('leaseUntil', '<=', dueTime)
        .limit(batchSize)
        .get(),
    ]);

    const reviewIds = new Set();
    for (const snapshot of [pendingSnapshot, expiredSnapshot]) {
      for (const document of snapshot.docs || []) reviewIds.add(document.id);
    }

    const results = await Promise.allSettled(
      Array.from(reviewIds, (reviewId) => processReviewJob(reviewId)),
    );
    const succeeded = results.filter(
      (result) => result.status === 'fulfilled' && result.value?.status === 'succeeded',
    ).length;
    const rejected = results.filter((result) => result.status === 'rejected').length;
    loggerCall(logger, rejected > 0 ? 'warn' : 'info', {
      event: 'review_retry_scan_completed',
      found: reviewIds.size,
      succeeded,
      rejected,
    });
    return { found: reviewIds.size, succeeded, rejected };
  }

  return { processReviewJob, handleReviewJobEvent, retryDueReviewJobs };
}

module.exports = {
  MODEL_VERSION,
  MAX_ATTEMPTS,
  ReviewWorkerError,
  createReviewWorker,
  normalizeLabel,
};
