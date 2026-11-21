function readZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: pick('year'), month: pick('month'), day: pick('day'), hour: pick('hour'), minute: pick('minute'),
  };
}

function matches(parts: ReturnType<typeof readZonedParts>, expected: { year: number; month: number; day: number; hour: number; minute: number }) {
  return parts.year === expected.year && parts.month === expected.month && parts.day === expected.day &&
    parts.hour === expected.hour && parts.minute === expected.minute;
}

/** Converts a class-local date and time into an epoch without relying on the device's time zone. */
export function zonedDateTimeToEpochMs(dateText: string, timeText: string, timeZone: string): number {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeText.trim());
  if (!dateMatch || !timeMatch) throw new Error('Masukkan tanggal YYYY-MM-DD dan waktu HH:mm.');
  const expected = {
    year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]), minute: Number(timeMatch[2]),
  };
  const utcTarget = Date.UTC(expected.year, expected.month - 1, expected.day, expected.hour, expected.minute);
  const dateProbe = new Date(utcTarget);
  if (dateProbe.getUTCFullYear() !== expected.year || dateProbe.getUTCMonth() + 1 !== expected.month || dateProbe.getUTCDate() !== expected.day) {
    throw new Error('Tanggal tidak valid.');
  }
  let epoch = utcTarget;
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const actual = readZonedParts(new Date(epoch), timeZone);
      const asUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
      const correction = utcTarget - asUtc;
      epoch += correction;
      if (correction === 0) break;
    }
    if (!matches(readZonedParts(new Date(epoch), timeZone), expected)) {
      throw new Error('Waktu tersebut tidak tersedia pada zona waktu kelas. Pilih waktu lain.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('tidak tersedia')) throw error;
    throw new Error('Zona waktu kelas tidak valid. Periksa pengaturan kelas.');
  }
  return epoch;
}

export function formatSessionRange(date: string, startTime: string, endDate: string, endTime: string, timeZone: string) {
  const range = date === endDate ? `${date} · ${startTime}–${endTime}` : `${date} ${startTime}–${endDate} ${endTime}`;
  return `${range} · ${timeZone}`;
}
