const assert = require('node:assert/strict');
const { test } = require('node:test');

const { loadTypeScript } = require('./load-typescript.cjs');
const { demoReducer, initialDemo } = loadTypeScript('src/features/demo/state.ts');

test('demo switches actors while preserving one check-in and the terminal session status', () => {
  const base = { sessionId: 'session-1' };
  const assistant = { ...base, actorId: 'assistant-demo' };
  const student = { ...base, actorId: 'student-demo-1', kind: 'checkIn', time: 10 };
  assert.equal(demoReducer(initialDemo, student), initialDemo);
  assert.equal(demoReducer(initialDemo, { ...student, kind: 'open' }), initialDemo);
  const open = demoReducer(initialDemo, { ...assistant, kind: 'open' });
  const present = demoReducer(open, student);
  assert.deepEqual(present.attendance, [{ ...base, studentId: student.actorId, time: 10 }]);
  assert.equal(demoReducer(present, { ...student, time: 20 }), present);
  const closed = demoReducer(present, { ...assistant, kind: 'close' });
  assert.equal(closed.status['session-1'], 'closed');
  assert.equal(demoReducer(closed, { ...student, actorId: 'student-demo-2' }), closed);
  assert.equal(demoReducer(closed, { ...assistant, kind: 'open' }), closed);
  assert.deepEqual(initialDemo, { status: {}, attendance: [] });
});
