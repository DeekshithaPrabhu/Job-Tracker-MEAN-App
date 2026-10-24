import { JobStatus, Priority } from './job.model';

export type DateRangeKey = 'applied' | 'interview';

/** A date filter is a preset ("last 7 days") or a custom range of days (yyyy-mm-dd). */
export interface DateFilter {
  preset: string;
  from: string;
  to: string;
}

export interface JobFilters {
  search: string;
  statuses: JobStatus[];
  priorities: Priority[];
  location: string;
  workMode: string;
  employmentType: string;
  experienceLevel: string;
  applied: DateFilter;
  interview: DateFilter;
}

export const DATE_PRESETS: Record<DateRangeKey, { id: string; label: string }[]> = {
  applied: [
    { id: '7d', label: 'Last 7 days' },
    { id: '30d', label: 'Last 30 days' },
    { id: '90d', label: 'Last 90 days' },
    { id: 'custom', label: 'Custom range' }
  ],
  interview: [
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'next7d', label: 'Next 7 days' },
    { id: 'next30d', label: 'Next 30 days' },
    { id: 'past', label: 'Past' },
    { id: 'custom', label: 'Custom range' }
  ]
};

export const DATE_LABELS: Record<DateRangeKey, string> = { applied: 'Application date', interview: 'Interview date' };

export const SORT_OPTIONS = [
  { value: 'dateSaved:desc', label: 'Newest saved' },
  { value: 'dateSaved:asc', label: 'Oldest saved' },
  { value: 'appliedAt:desc', label: 'Latest application' },
  { value: 'appliedAt:asc', label: 'Earliest application' },
  { value: 'interview:asc', label: 'Upcoming interview' },
  { value: 'salary:desc', label: 'Salary, high to low' },
  { value: 'salary:asc', label: 'Salary, low to high' },
  { value: 'company:asc', label: 'Company A to Z' },
  { value: 'title:asc', label: 'Job title A to Z' }
] as const;

export const DEFAULT_SORT = 'dateSaved:desc';
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export const emptyDate = (): DateFilter => ({ preset: '', from: '', to: '' });

export const emptyFilters = (): JobFilters => ({
  search: '',
  statuses: [],
  priorities: [],
  location: '',
  workMode: '',
  employmentType: '',
  experienceLevel: '',
  applied: emptyDate(),
  interview: emptyDate()
});

export interface SavedFilter {
  _id: string;
  name: string;
  filters: JobFilters;
  sort: string;
  order: 'asc' | 'desc';
}
