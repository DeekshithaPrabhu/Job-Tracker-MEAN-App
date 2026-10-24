/** Date, time and time zone helpers (no libraries; built on Intl). */

const FALLBACK_ZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Madrid', 'Asia/Dubai',
  'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney', 'Pacific/Auckland'
];

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function allTimeZones(): string[] {
  let zones: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    zones = intl.supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  if (!zones.length) zones = [...FALLBACK_ZONES];
  for (const extra of ['UTC', localTimeZone()]) {
    if (!zones.includes(extra)) zones = [extra, ...zones];
  }
  return zones;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset of a zone from UTC, in milliseconds, at a given instant (positive when ahead of UTC). */
function offsetMs(utcMs: number, timeZone: string): number {
  const whole = Math.floor(utcMs / 1000) * 1000;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(whole));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - whole;
}

/** Turns a wall-clock date and time in a time zone ("2026-10-28", "10:00", "Asia/Kolkata") into the real instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone); // re-check across daylight saving changes
  return new Date(second);
}

/** The wall-clock date ("yyyy-mm-dd") and time ("HH:mm") of an instant in a time zone. */
export function utcToZoned(iso: string | Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** Local calendar day of a date as "yyyy-mm-dd". */
export function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Today", "Tomorrow", "Yesterday" or "Wed 28 Oct". */
export function dayLabel(key: string, nowMs = Date.now()): string {
  const today = new Date(nowMs);
  const day = (offset: number) => dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));
  if (key === day(0)) return 'Today';
  if (key === day(1)) return 'Tomorrow';
  if (key === day(-1)) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(keyToDate(key));
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "in 55 minutes", "in 2 days", "3 hours ago", "now". */
export function relativeTime(iso: string, nowMs = Date.now()): string {
  const diff = Math.round((new Date(iso).getTime() - nowMs) / 60000);
  const abs = Math.abs(diff);
  if (abs < 1) return 'now';
  const text = abs < 60 ? plural(abs, 'minute') : abs < 1440 ? plural(Math.round(abs / 60), 'hour') : plural(Math.round(abs / 1440), 'day');
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Describes a moment in the event's own time zone and, when different, in the viewer's. */
export function describeWhen(iso: string, timeZone: string): { event: string; local: string } {
  const d = new Date(iso);
  const fmt = (zone: string) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    }).format(d);
  const local = localTimeZone();
  return { event: fmt(timeZone), local: timeZone !== local ? fmt(local) : '' };
}

/** Just the clock time with a zone abbreviation, like "10:00 AM GMT+5:30". */
export function clockInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));
}
