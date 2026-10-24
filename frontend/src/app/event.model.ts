export const EVENT_TYPES = ['Interview', 'Recruiter Call', 'Assessment', 'Follow-up', 'Check-in'] as const;
export const INTERVIEW_ROUNDS = ['HR', 'Technical', 'Managerial', 'Final'] as const;
export const EVENT_STATUSES = ['Scheduled', 'Completed', 'Rescheduled', 'Cancelled'] as const;
export const CHANNELS = ['Email', 'Phone', 'LinkedIn', 'Other'] as const;
export const DURATIONS = [15, 30, 45, 60, 90, 120] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type InterviewRound = (typeof INTERVIEW_ROUNDS)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_COLORS: Record<EventType, string> = {
  Interview: '#007aff',
  'Recruiter Call': '#30b0c7',
  Assessment: '#af52de',
  'Follow-up': '#ff9500',
  'Check-in': '#34c759'
};

export const REMINDER_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'At the time' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 180, label: '3 hours before' },
  { minutes: 1440, label: '1 day before' },
  { minutes: 2880, label: '2 days before' }
];

/** Reminders suggested for each kind of event until the person picks their own. */
export const DEFAULT_REMINDERS: Record<EventType, number[]> = {
  Interview: [1440, 60],
  'Recruiter Call': [60],
  Assessment: [1440, 60],
  'Follow-up': [1440, 0],
  'Check-in': [0]
};

export function reminderLabel(minutes: number): string {
  const preset = REMINDER_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;
  if (minutes < 60) return `${minutes} minutes before`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hours before`;
  return `${Math.round(minutes / 1440)} days before`;
}

export interface Interviewer {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
}

export interface EventReminder {
  _id: string;
  minutesBefore: number;
  dismissedAt?: string;
}

export interface JobRef {
  _id: string;
  company: string;
  title: string;
  status?: string;
  isArchived?: boolean;
}

export interface Rescheduled {
  startsAt: string;
  timeZone?: string;
  changedAt: string;
  note?: string;
}

export interface JobEvent {
  _id: string;
  job: JobRef;
  type: EventType;
  round?: InterviewRound;
  title?: string;
  startsAt: string;
  timeZone: string;
  durationMinutes: number;
  meetingLink?: string;
  location?: string;
  channel?: string;
  interviewers: Interviewer[];
  prepNotes?: string;
  status: EventStatus;
  completedAt?: string;
  reminders: EventReminder[];
  rescheduledFrom: Rescheduled[];
  jobStatusChanged?: string | null;
}

export interface EventInput {
  job: string;
  type: EventType;
  round: string | null;
  title: string;
  startsAt: string;
  timeZone: string;
  durationMinutes: number;
  meetingLink: string;
  location: string;
  channel: string | null;
  interviewers: Interviewer[];
  prepNotes: string;
  reminders: number[];
  updateJobStatus?: boolean;
}

export interface DueReminder {
  eventId: string;
  reminderId: string;
  minutesBefore: number;
  event: JobEvent;
}

export const isActive = (e: JobEvent): boolean => e.status === 'Scheduled' || e.status === 'Rescheduled';
export const isFollowUpType = (t: EventType): boolean => t === 'Follow-up' || t === 'Check-in';

/** A readable name for an event: its title, or "Technical interview", "Recruiter call", and so on. */
export function eventLabel(e: Pick<JobEvent, 'type' | 'round' | 'title'>): string {
  if (e.title) return e.title;
  switch (e.type) {
    case 'Interview': return e.round ? `${e.round} interview` : 'Interview';
    case 'Recruiter Call': return 'Recruiter call';
    case 'Check-in': return 'Application check-in';
    default: return e.type;
  }
}
