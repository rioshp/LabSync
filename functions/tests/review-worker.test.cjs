'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createReviewWorker } = require('../review-worker.cjs');

class FakeTimestamp {
  constructor(milliseconds) {
    this.milliseconds = milliseconds;
  }

  toMillis() {
    return this.milliseconds;
  }

  static fromDate(date) {
    return new FakeTimestamp(date.getTime());
  }
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return null;
}

class FakeSnapshot {
  constructor(id, value) {
    this.id = id;
    this.exists = value !== undefined;
    this.value = value;
  }

  data() {
    return this.value && { ...this.value };
  }
}

class FakeDocumentReference {
  constructor(db, collection, id) {
    this.db = db;
    this.collectionName = collection;
    this.id = id;
  }

  async get() {
    return new FakeSnapshot(this.id, this.db.read(this.collectionName, this.id));
  }
}

class FakeQuery {
  constructor(db, collection, filters = [], maximum = Infinity) {
    this.db = db;
    this.collectionName = collection;
    this.filters = filters;
    this.maximum = maximum;
  }

  where(field, operator, value) {
    return new FakeQuery(
      this.db,
      this.collectionName,
      [...this.filters, { field, operator, value }],
      this.maximum,
    );
  }

  limit(maximum) {
    return new FakeQuery(this.db, this.collectionName, this.filters, maximum);
  }

  async get() {
    const rows = this.db
      .all(this.collectionName)
      .filter(({ value }) =>
        this.filters.every(({ field, operator, value: expected }) => {
          const actual = value[field];
          if (operator === '==') return actual === expected;
          if (operator === '<=') {
            const actualMillis = timestampMillis(actual);
            const expectedMillis = timestampMillis(expected);
            return actualMillis != null && expectedMillis != null && actualMillis <= expectedMillis;
          }
          throw new Error(`Unsupported query operator: ${operator}`);
        }),
      )
      .slice(0, this.maximum);
    return { docs: rows.map(({ id, value }) => new FakeSnapshot(id, value)) };
  }
}

class FakeCollectionReference extends FakeQuery {
  doc(id) {
    return new FakeDocumentReference(this.db, this.collectionName, id);
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
    this.writes = [];
  }

  async get(reference) {
    return reference.get();
  }

  update(reference, value) {
    this.writes.push({ type: 'update', reference, value });
  }

  set(reference, value, options = {}) {
    this.writes.push({ type: 'set', reference, value, options });
  }
}

class FakeFirestore {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    return new FakeCollectionReference(this, name);
  }

  seed(collection, id, value) {
    this.collectionMap(collection).set(id, { ...value });
  }

  read(collection, id) {
    const value = this.collectionMap(collection).get(id);
    return value && { ...value };
  }

  all(collection) {
    return [...this.collectionMap(collection)].map(([id, value]) => ({ id, value }));
  }

  async runTransaction(callback) {
    const transaction = new FakeTransaction(this);
    const result = await callback(transaction);
    for (const write of transaction.writes) this.applyWrite(write);
    return result;
  }

  collectionMap(name) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    return this.collections.get(name);
  }

  applyWrite({ type, reference, value, options }) {
    const collection = this.collectionMap(reference.collectionName);
    const existing = collection.get(reference.id);
    if (type === 'update' && !existing) {
      throw new Error(`Cannot update missing ${reference.collectionName}/${reference.id}`);
    }
    const next = type === 'set' && !options.merge ? {} : { ...(existing || {}) };
    for (const [field, fieldValue] of Object.entries(value)) {
      if (fieldValue && typeof fieldValue === 'object' && '__increment' in fieldValue) {
        next[field] = (Number(next[field]) || 0) + fieldValue.__increment;
      } else {
        next[field] = fieldValue;
      }
    }
    collection.set(reference.id, next);
  }
}

function createHarness({ classify, config = {} } = {}) {
  const db = new FakeFirestore();
  let currentTime = Date.UTC(2026, 10, 21, 10, 0, 0);
  const logs = [];
  const FieldValue = {
    serverTimestamp: () => FakeTimestamp.fromDate(new Date(currentTime)),
    increment: (amount) => ({ __increment: amount }),
  };
  const worker = createReviewWorker({
    db,
    classify,
    FieldValue,
    Timestamp: FakeTimestamp,
    now: () => new Date(currentTime),
    logger: {
      info: (entry) => logs.push(entry),
      warn: (entry) => logs.push(entry),
      error: (entry) => logs.push(entry),
    },
    config,
  });

  function seedReview({ text = 'Penjelasan praktikum mudah dipahami.' } = {}) {
    const reviewId = 'session-a~student-a';
    db.seed('reviews', reviewId, {
      classId: 'class-a',
      sessionId: 'session-a',
      assistantUid: 'assistant-a',
      studentUid: 'student-a',
      text,
      submittedAt: FakeTimestamp.fromDate(new Date(currentTime)),
      analysisStatus: 'pending',
      sentiment: null,
      modelVersion: null,
      analyzedAt: null,
    });
    db.seed('reviewJobs', reviewId, {
      state: 'pending',
      attemptCount: 0,
      leaseUntil: null,
      attemptId: null,
      nextAttemptAt: FakeTimestamp.fromDate(new Date(currentTime)),
      lastErrorCode: null,
      updatedAt: FakeTimestamp.fromDate(new Date(currentTime)),
    });
    db.seed('reviewSummaries', 'session-a', {
      classId: 'class-a',
      assistantUid: 'assistant-a',
      totalSubmitted: 1,
      positiveCount: 0,
      neutralCount: 0,
      negativeCount: 0,
      failedCount: 0,
      updatedAt: FakeTimestamp.fromDate(new Date(currentTime)),
    });
    return reviewId;
  }

  return {
    db,
    logs,
    seedReview,
    worker,
    get currentTime() {
      return currentTime;
    },
    advanceTime(milliseconds) {
      currentTime += milliseconds;
    },
  };
}

test('new review jobs classify only the review text and atomically update the summary', async () => {
  const received = [];
  const harness = createHarness({
    classify: (text) => {
      received.push(text);
      return { label: 'positif' };
    },
  });
  const reviewId = harness.seedReview({ text: 'Penjelasan praktikum mudah dipahami.' });

  const result = await harness.worker.handleReviewJobEvent({
    reviewId,
    before: null,
    after: { state: 'pending' },
  });

  assert.deepEqual(result, { status: 'succeeded' });
  assert.deepEqual(received, ['Penjelasan praktikum mudah dipahami.']);
  assert.equal(harness.db.read('reviews', reviewId).sentiment, 'positive');
  assert.equal(harness.db.read('reviews', reviewId).analysisStatus, 'succeeded');
  assert.equal(harness.db.read('reviewJobs', reviewId).state, 'succeeded');
  assert.equal(harness.db.read('reviewSummaries', 'session-a').positiveCount, 1);
  assert.equal(harness.db.read('reviewSummaries', 'session-a').totalSubmitted, 1);
  assert.ok(harness.logs.some((entry) => entry.event === 'review_analysis_succeeded'));
  assert.ok(harness.logs.every((entry) => !JSON.stringify(entry).includes('Penjelasan praktikum')));
});

test('invalid model output fails the review without mislabeling it as neutral', async () => {
  const harness = createHarness({ classify: () => ({ label: null }) });
  const reviewId = harness.seedReview();

  const result = await harness.worker.handleReviewJobEvent({
    reviewId,
    before: null,
    after: { state: 'pending' },
  });

  assert.deepEqual(result, { status: 'failed', errorCode: 'MODEL_OUTPUT_INVALID' });
  assert.equal(harness.db.read('reviews', reviewId).analysisStatus, 'failed');
  assert.equal(harness.db.read('reviews', reviewId).sentiment, null);
  assert.equal(harness.db.read('reviewJobs', reviewId).lastErrorCode, 'MODEL_OUTPUT_INVALID');
  assert.equal(harness.db.read('reviewSummaries', 'session-a').failedCount, 1);
});

test('a valid neutral model result is stored as neutral and counted once', async () => {
  const harness = createHarness({ classify: () => ({ label: 'netral' }) });
  const reviewId = harness.seedReview();

  const result = await harness.worker.handleReviewJobEvent({
    reviewId,
    before: null,
    after: { state: 'pending' },
  });

  assert.deepEqual(result, { status: 'succeeded' });
  assert.equal(harness.db.read('reviews', reviewId).sentiment, 'neutral');
  assert.equal(harness.db.read('reviewSummaries', 'session-a').neutralCount, 1);
  assert.equal(harness.db.read('reviewSummaries', 'session-a').failedCount, 0);
});

test('the bundled model predicts all three Project.md labels from Indonesian fixtures', async () => {
  const fixtures = [
    [
      'Alhamdulillah penyampaian materi sangat jelas dan mudah dipahami, terima kasih pak.',
      'positive',
    ],
    ['Pelaksanaan praktikum cukup sesuai jadwal.', 'neutral'],
    [
      'Fasilitas komputer buruk, proyektor tidak jelas dan sering mati, mengajar terlalu cepat.',
      'negative',
    ],
  ];

  for (const [text, expected] of fixtures) {
    const harness = createHarness();
    const reviewId = harness.seedReview({ text });
    const result = await harness.worker.processReviewJob(reviewId, { allowEarly: true });

    assert.deepEqual(result, { status: 'succeeded' });
    assert.equal(harness.db.read('reviews', reviewId).sentiment, expected, text);
    assert.equal(harness.db.read('reviewSummaries', 'session-a')[`${expected}Count`], 1);
  }
});

test('transient model errors back off and the scheduled scan resumes due work', async () => {
  let calls = 0;
  const harness = createHarness({
    classify: () => {
      calls += 1;
      if (calls === 1) throw new Error('private comment must not be logged');
      return { label: 'negatif' };
    },
  });
  const reviewId = harness.seedReview();

  const first = await harness.worker.handleReviewJobEvent({
    reviewId,
    before: null,
    after: { state: 'pending' },
  });
  const firstJob = harness.db.read('reviewJobs', reviewId);

  assert.equal(first.status, 'retry_scheduled');
  assert.equal(firstJob.state, 'pending');
  assert.equal(firstJob.attemptCount, 1);
  assert.equal(timestampMillis(firstJob.nextAttemptAt), harness.currentTime + 30_000);
  assert.equal(harness.db.read('reviews', reviewId).analysisStatus, 'pending');

  const retryEvent = await harness.worker.handleReviewJobEvent({
    reviewId,
    before: { state: 'processing' },
    after: { state: 'pending' },
  });
  assert.deepEqual(retryEvent, { status: 'ignored' });

  harness.advanceTime(30_001);
  const scan = await harness.worker.retryDueReviewJobs();

  assert.deepEqual(scan, { found: 1, succeeded: 1, rejected: 0 });
  assert.equal(calls, 2);
  assert.equal(harness.db.read('reviews', reviewId).sentiment, 'negative');
  assert.equal(harness.db.read('reviewSummaries', 'session-a').negativeCount, 1);
  assert.ok(harness.logs.every((entry) => !JSON.stringify(entry).includes('private comment')));
});

test('three transient failures produce one terminal failure count', async () => {
  const harness = createHarness({
    classify: () => {
      throw new Error('temporary outage');
    },
  });
  const reviewId = harness.seedReview();

  const first = await harness.worker.handleReviewJobEvent({
    reviewId,
    before: null,
    after: { state: 'pending' },
  });
  assert.equal(first.status, 'retry_scheduled');

  harness.advanceTime(30_001);
  const secondScan = await harness.worker.retryDueReviewJobs();
  assert.equal(secondScan.found, 1);
  assert.equal(harness.db.read('reviewJobs', reviewId).attemptCount, 2);
  assert.equal(harness.db.read('reviewJobs', reviewId).state, 'pending');
  assert.equal(
    timestampMillis(harness.db.read('reviewJobs', reviewId).nextAttemptAt),
    harness.currentTime + 60_000,
  );

  harness.advanceTime(60_001);
  const thirdScan = await harness.worker.retryDueReviewJobs();

  assert.equal(thirdScan.found, 1);
  assert.equal(harness.db.read('reviewJobs', reviewId).attemptCount, 3);
  assert.equal(harness.db.read('reviewJobs', reviewId).state, 'failed');
  assert.equal(harness.db.read('reviews', reviewId).analysisStatus, 'failed');
  assert.equal(harness.db.read('reviewSummaries', 'session-a').failedCount, 1);
});

test('an expired lease can be reclaimed and a stale attempt cannot overwrite its result', async () => {
  let markFirstStarted;
  let releaseFirst;
  const firstStarted = new Promise((resolve) => {
    markFirstStarted = resolve;
  });
  const firstResult = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let calls = 0;
  const harness = createHarness({
    classify: async () => {
      calls += 1;
      if (calls === 1) {
        markFirstStarted();
        await firstResult;
        return { label: 'positif' };
      }
      return { label: 'negatif' };
    },
    config: { leaseMs: 1_000 },
  });
  const reviewId = harness.seedReview();
  const firstAttempt = harness.worker.processReviewJob(reviewId);
  await firstStarted;

  harness.advanceTime(1_001);
  const secondAttempt = await harness.worker.processReviewJob(reviewId);
  releaseFirst();
  const staleAttempt = await firstAttempt;

  assert.deepEqual(secondAttempt, { status: 'succeeded' });
  assert.deepEqual(staleAttempt, { status: 'stale_attempt' });
  assert.equal(calls, 2);
  assert.equal(harness.db.read('reviews', reviewId).sentiment, 'negative');
  assert.equal(harness.db.read('reviewSummaries', 'session-a').negativeCount, 1);
  assert.equal(harness.db.read('reviewSummaries', 'session-a').positiveCount, 0);
});
