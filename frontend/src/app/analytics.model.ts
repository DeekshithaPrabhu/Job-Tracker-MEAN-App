import { EventStatus, EventType, InterviewRound } from './event.model';
import { JobStatus } from './job.model';

export type SeriesRange = 'weeks' | 'months';

export interface SeriesPoint {
  /** First day of the week (Monday) or month, as yyyy-mm-dd. */
  start: string;
  saved: number;
  applied: number;
  interviews: number;
  offers: number;
  rejections: number;
}

export interface AnalyticsEvent {
  _id: string;
  type: EventType;
  round?: InterviewRound;
  title?: string;
  startsAt: string;
  timeZone: string;
  status: EventStatus;
  job: { _id: string; company: string; title: string };
  /** Only on overdue items: a follow-up that is late, or an event that has passed and needs an update. */
  overdueKind?: 'follow-up' | 'update';
}

export type ActionKind =
  | 'offer' | 'overdue-followup' | 'needs-update' | 'prepare' | 'followup-soon'
  | 'waiting' | 'stale-applied' | 'saved-idle';

export interface NextAction {
  kind: ActionKind;
  priority: number;
  text: string;
  detail: string;
  jobId: string;
  eventId?: string;
}

export interface Insight {
  level: 'warn' | 'info' | 'good';
  title: string;
  detail: string;
}

export interface RecentItem {
  at: string;
  kind: 'saved' | 'status' | 'event';
  text: string;
  detail?: string;
  status?: JobStatus;
  eventType?: EventType;
  jobId: string;
  eventId?: string;
  archived: boolean;
}

export interface Analytics {
  generatedAt: string;
  timeZone: string;
  totals: {
    saved: number;
    active: number;
    archived: number;
    applied: number;
    appliedLast7: number;
    appliedPrev7: number;
    interviewed: number;
    offersReceived: number;
    offersOpen: number;
    rejections: number;
    upcomingInterviews: number;
    nextInterview: AnalyticsEvent | null;
    overdueFollowUps: number;
    needsUpdate: number;
  };
  /** Percentages, or null when there is nothing to divide by yet. */
  rates: { applied: number | null; interview: number | null; offer: number | null };
  funnel: { key: string; label: string; count: number }[];
  byStatus: { status: JobStatus; count: number }[];
  series: Record<SeriesRange, SeriesPoint[]>;
  upcoming: AnalyticsEvent[];
  overdue: AnalyticsEvent[];
  nextActions: NextAction[];
  nextActionsTotal: number;
  insights: Insight[];
  recent: RecentItem[];
}
