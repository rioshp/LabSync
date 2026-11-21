'use strict';

class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

function error(code, message) {
  throw new DomainError(code, message);
}

function requiredString(value, field, min = 1, max = 512) {
  if (typeof value !== 'string') error('invalid-argument', `${field} must be a string.`);
  const clean = value.trim();
  if (clean.length < min || clean.length > max) {
    error('invalid-argument', `${field} must contain ${min}–${max} characters.`);
  }
  return clean;
}

function documentId(value, field) {
  const id = requiredString(value, field, 1, 512);
  if (id.includes('/')) error('invalid-argument', `${field} is invalid.`);
  return id;
}

function normalizeNim(value) {
  const nim = requiredString(value, 'nim', 1, 30).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{0,29}$/.test(nim)) {
    error('invalid-argument', 'NIM may contain letters, numbers, and hyphens only.');
  }
  return nim;
}

function assertObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    error('invalid-argument', 'Request body must be an object.');
  }
  return value;
}

function assertAllowedKeys(input, allowed) {
  const accepted = new Set(allowed);
  for (const key of Object.keys(input)) {
    if (!accepted.has(key)) error('invalid-argument', `Unexpected field: ${key}.`);
  }
}

function parseMillis(value, field, Timestamp) {
  let millis;
  if (typeof value === 'number') millis = value;
  else if (typeof value === 'string' && value.trim()) millis = Date.parse(value);
  else if (value && typeof value.toMillis === 'function') millis = value.toMillis();
  else if (value && typeof value.seconds === 'number')
    millis = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  if (!Number.isSafeInteger(Math.floor(millis)) || !Number.isFinite(millis) || millis < 0) {
    error('invalid-argument', `${field} must be a valid Unix timestamp in milliseconds.`);
  }
  return Timestamp.fromMillis(Math.floor(millis));
}

function validateTimeZone(value) {
  const timeZone = requiredString(value, 'timeZone', 1, 100);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
  } catch {
    error('invalid-argument', 'timeZone must be a valid IANA time zone.');
  }
  return timeZone;
}

function validateSchedule(input, Timestamp) {
  const moduleTitle = requiredString(input.moduleTitle, 'moduleTitle', 1, 120);
  const room = requiredString(input.room, 'room', 1, 120);
  const startsAt = parseMillis(input.startsAt, 'startsAt', Timestamp);
  const endsAt = parseMillis(input.endsAt, 'endsAt', Timestamp);
  if (endsAt.toMillis() <= startsAt.toMillis()) {
    error('invalid-argument', 'endsAt must be later than startsAt.');
  }
  return { moduleTitle, room, startsAt, endsAt };
}

module.exports = {
  DomainError,
  error,
  requiredString,
  documentId,
  normalizeNim,
  assertObject,
  assertAllowedKeys,
  validateTimeZone,
  validateSchedule,
};
