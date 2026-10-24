export const WORK_MODES = ['Remote', 'Hybrid', 'On-site'] as const;
export const EMPLOYMENT_TYPES = ['Full-time', 'Contract', 'Internship'] as const;
export const EXPERIENCE_LEVELS = ['Entry', 'Junior', 'Mid', 'Senior', 'Lead', 'Principal'] as const;
export const PRIORITIES = ['High', 'Medium', 'Low'] as const;
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'] as const;

export const STATUSES = [
  'Saved / Interested',
  'Applied',
  'Assessment',
  'Interview Scheduled',
  'Interview Completed',
  'Offer Received',
  'Rejected',
  'Withdrawn'
] as const;

export type WorkMode = (typeof WORK_MODES)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export type JobStatus = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type JobView = 'active' | 'favorites' | 'archived';

/** Apple system colors, one per pipeline stage. */
export const STATUS_COLORS: Record<JobStatus, string> = {
  'Saved / Interested': '#8e8e93',
  Applied: '#007aff',
  Assessment: '#af52de',
  'Interview Scheduled': '#ff9500',
  'Interview Completed': '#5856d6',
  'Offer Received': '#34c759',
  Rejected: '#ff3b30',
  Withdrawn: '#a2845e'
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  High: '#ff3b30',
  Medium: '#ff9500',
  Low: '#8e8e93'
};

export interface StatusChange {
  from: JobStatus | null;
  to: JobStatus;
  changedAt: string;
  note?: string;
}

export interface Recruiter {
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
}

export interface Salary {
  min?: number | null;
  max?: number | null;
  currency?: string;
}

export interface Job {
  _id: string;
  company: string;
  title: string;
  location?: string;
  workMode: WorkMode;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  description?: string;
  postingUrl?: string;
  dateSaved: string;
  salary?: Salary;
  skills: string[];
  recruiter?: Recruiter;
  status: JobStatus;
  priority: Priority;
  /** When the application was submitted; set the first time the job reaches an applied stage, and editable. */
  appliedAt?: string | null;
  /** Start of the next upcoming Interview event, added by the API when listing jobs. */
  nextInterviewAt?: string | null;
  statusChangedAt?: string;
  statusHistory: StatusChange[];
  /** Set by the API when a status change cancelled upcoming events (withdrawing from a job). */
  cancelledEvents?: number;
  isFavorite: boolean;
  isArchived: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type JobInput = Omit<
  Job,
  '_id' | 'isFavorite' | 'isArchived' | 'createdAt' | 'updatedAt' | 'statusChangedAt' | 'statusHistory' | 'nextInterviewAt'
>;

export interface JobQuery {
  /** The three list tabs, or 'all' to include archived jobs too (used by the event form). */
  view: JobView | 'all';
  search?: string;
  /** One status or a comma separated list. */
  status?: string;
  /** Comma separated: High, Medium, Low. */
  priority?: string;
  location?: string;
  workMode?: string;
  employmentType?: string;
  experienceLevel?: string;
  /** ISO date-times (inclusive) for the application date and for any interview. */
  appliedFrom?: string;
  appliedTo?: string;
  interviewFrom?: string;
  interviewTo?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/** One page of jobs. statusCounts covers every match, not just this page. */
export interface JobPage {
  items: Job[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  statusCounts: Partial<Record<JobStatus, number>>;
}

export interface JobStats {
  active: number;
  favorites: number;
  archived: number;
}

export function formatSalary(salary?: Salary): string {
  const { min, max, currency } = salary ?? {};
  if (min == null && max == null) return '';
  const fmt = new Intl.NumberFormat('en', {
    style: 'currency', currency: currency || 'USD', notation: 'compact', maximumFractionDigits: 1
  });
  if (min != null && max != null) return `${fmt.format(min)} to ${fmt.format(max)}`;
  return min != null ? `From ${fmt.format(min)}` : `Up to ${fmt.format(max as number)}`;
}
