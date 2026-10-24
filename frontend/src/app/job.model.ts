export const WORK_MODES = ['Remote', 'Hybrid', 'On-site'] as const;
export const EMPLOYMENT_TYPES = ['Full-time', 'Contract', 'Internship'] as const;
export const EXPERIENCE_LEVELS = ['Entry', 'Junior', 'Mid', 'Senior', 'Lead', 'Principal'] as const;
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'] as const;

export type WorkMode = (typeof WORK_MODES)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export type JobView = 'active' | 'favorites' | 'archived';

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
  isFavorite: boolean;
  isArchived: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type JobInput = Omit<Job, '_id' | 'isFavorite' | 'isArchived' | 'createdAt' | 'updatedAt'>;

export interface JobQuery {
  view: JobView;
  search?: string;
  workMode?: string;
  employmentType?: string;
  experienceLevel?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface JobStats {
  active: number;
  favorites: number;
  archived: number;
}
