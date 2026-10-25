import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subject, debounceTime, tap } from 'rxjs';
import {
  DATE_PRESETS, DEFAULT_PAGE_SIZE, DEFAULT_SORT, DateFilter, DateRangeKey, JobFilters, PAGE_SIZES, SavedFilter,
  emptyDate, emptyFilters
} from './job-query.model';
import { JobPage, JobQuery, JobStatus, Priority } from './job.model';

const PAGE_SIZE_KEY = 'job-tracker:page-size';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Turns a date filter into real instants, using the viewer's own calendar days. */
export function resolveRange(filter: DateFilter, now = new Date()): { from?: string; to?: string } {
  const iso = (d: Date) => d.toISOString();
  switch (filter.preset) {
    case '7d': return { from: iso(startOfDay(addDays(now, -6))) };
    case '30d': return { from: iso(startOfDay(addDays(now, -29))) };
    case '90d': return { from: iso(startOfDay(addDays(now, -89))) };
    case 'upcoming': return { from: iso(now) };
    case 'next7d': return { from: iso(now), to: iso(endOfDay(addDays(now, 7))) };
    case 'next30d': return { from: iso(now), to: iso(endOfDay(addDays(now, 30))) };
    case 'past': return { to: iso(now) };
    case 'custom':
      return {
        from: filter.from ? iso(startOfDay(parseDay(filter.from))) : undefined,
        to: filter.to ? iso(endOfDay(parseDay(filter.to))) : undefined
      };
    default: return {};
  }
}

const dateActive = (f: DateFilter) => !!f.preset && (f.preset !== 'custom' || !!f.from || !!f.to);

function savedPageSize(): number {
  try {
    const n = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

/**
 * Search, filter, sort and paging state for the Applications page (board and table share it),
 * plus the saved filters kept on the server. The page that owns the list reloads when changed$ fires.
 */
@Injectable({ providedIn: 'root' })
export class JobQueryStore {
  private readonly http = inject(HttpClient);

  readonly filters = signal<JobFilters>(emptyFilters());
  readonly sortValue = signal(DEFAULT_SORT);
  readonly page = signal(1);
  readonly pageSize = signal(savedPageSize());

  // Filled from each response.
  readonly total = signal(0);
  readonly pages = signal(1);
  readonly statusCounts = signal<Partial<Record<JobStatus, number>>>({});

  readonly saved = signal<SavedFilter[]>([]);
  readonly activeSavedId = signal<string | null>(null);
  readonly savedError = signal('');

  /** Fires whenever the list has to be fetched again. */
  readonly changed$ = new Subject<void>();
  private readonly text$ = new Subject<void>();
  private pendingText: Partial<Pick<JobFilters, 'search' | 'location'>> = {};

  /** How many filter groups are switched on (search, status, priority, location, and so on). */
  readonly activeCount = computed(() => {
    const f = this.filters();
    return [
      f.search.trim(), f.statuses.length, f.priorities.length, f.location.trim(), f.workMode, f.employmentType,
      f.experienceLevel, dateActive(f.applied), dateActive(f.interview)
    ].filter(Boolean).length;
  });

  readonly activeSaved = computed(() => this.saved().find((s) => s._id === this.activeSavedId()) ?? null);

  /** True when the filters or sorting differ from the saved filter that was applied. */
  readonly savedChanged = computed(() => {
    const s = this.activeSaved();
    if (!s) return false;
    return JSON.stringify(this.normalise(s.filters)) !== JSON.stringify(this.filters()) || `${s.sort}:${s.order}` !== this.sortValue();
  });

  constructor() {
    // Typing is applied after a short pause, and both text boxes share the pause.
    this.text$.pipe(debounceTime(250)).subscribe(() => {
      const pending = this.pendingText;
      this.pendingText = {};
      this.filters.update((f) => ({ ...f, ...pending }));
      this.reset();
    });
    this.loadSaved();
  }

  // --- Request ---

  /** Query parameters for the API, resolved against the current moment. */
  params(): Omit<JobQuery, 'view'> {
    const f = this.filters();
    const [sort, order] = this.sortValue().split(':');
    const applied = resolveRange(f.applied);
    const interview = resolveRange(f.interview);
    return {
      search: f.search.trim(),
      status: f.statuses.join(','),
      priority: f.priorities.join(','),
      location: f.location.trim(),
      workMode: f.workMode,
      employmentType: f.employmentType,
      experienceLevel: f.experienceLevel,
      appliedFrom: applied.from,
      appliedTo: applied.to,
      interviewFrom: interview.from,
      interviewTo: interview.to,
      sort,
      order: order as 'asc' | 'desc',
      page: this.page(),
      limit: this.pageSize()
    };
  }

  applyResult(result: JobPage): void {
    this.total.set(result.total);
    this.pages.set(result.pages);
    this.page.set(result.page);
    this.statusCounts.set(result.statusCounts ?? {});
  }

  // --- Filters ---

  /** Search and location: applied after a short pause. */
  setText(key: 'search' | 'location', value: string): void {
    this.pendingText[key] = value;
    this.text$.next();
  }

  toggleStatus(status: JobStatus): void {
    this.update$((f) => ({ ...f, statuses: toggle(f.statuses, status) }));
  }

  togglePriority(priority: Priority): void {
    this.update$((f) => ({ ...f, priorities: toggle(f.priorities, priority) }));
  }

  setField(key: 'workMode' | 'employmentType' | 'experienceLevel', value: string): void {
    this.update$((f) => ({ ...f, [key]: value }));
  }

  setDatePreset(key: DateRangeKey, preset: string): void {
    this.update$((f) => ({ ...f, [key]: { ...emptyDate(), preset } }));
  }

  setDateBound(key: DateRangeKey, bound: 'from' | 'to', value: string): void {
    this.update$((f) => ({ ...f, [key]: { ...f[key], [bound]: value } }));
  }

  setSort(value: string): void {
    this.sortValue.set(value);
    this.reset();
  }

  /** Search, filters, sorting, saved filter and page all go back to the defaults, with a single reload. */
  resetAll(): void {
    this.pendingText = {};
    this.filters.set(emptyFilters());
    this.sortValue.set(DEFAULT_SORT);
    this.activeSavedId.set(null);
    this.reset();
  }

  clear(): void {
    this.pendingText = {};
    this.filters.set(emptyFilters());
    this.activeSavedId.set(null);
    this.reset();
  }

  // --- Paging ---

  setPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.pages());
    if (next === this.page()) return;
    this.page.set(next);
    this.changed$.next();
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    try { localStorage.setItem(PAGE_SIZE_KEY, String(size)); } catch { /* storage unavailable */ }
    this.reset();
  }

  // --- Saved filters ---

  loadSaved(): void {
    this.http.get<SavedFilter[]>('/api/filters').subscribe({
      next: (list) => this.saved.set(list),
      error: () => this.savedError.set('Saved filters could not be loaded.')
    });
  }

  apply(id: string): void {
    const saved = this.saved().find((s) => s._id === id);
    if (!saved) {
      this.activeSavedId.set(null);
      return;
    }
    this.pendingText = {};
    this.filters.set(this.normalise(saved.filters));
    this.sortValue.set(`${saved.sort}:${saved.order}`);
    this.activeSavedId.set(saved._id);
    this.reset();
  }

  save(name: string): Observable<SavedFilter> {
    return this.http.post<SavedFilter>('/api/filters', { name, ...this.snapshot() }).pipe(
      tap((created) => {
        this.saved.update((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
        this.activeSavedId.set(created._id);
      })
    );
  }

  /** Overwrites the applied saved filter with what is on screen now. */
  update(): Observable<SavedFilter> {
    const id = this.activeSavedId() as string;
    return this.http.put<SavedFilter>(`/api/filters/${id}`, this.snapshot()).pipe(
      tap((updated) => this.saved.update((list) => list.map((s) => (s._id === updated._id ? updated : s))))
    );
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/filters/${id}`).pipe(
      tap(() => {
        this.saved.update((list) => list.filter((s) => s._id !== id));
        if (this.activeSavedId() === id) this.activeSavedId.set(null);
      })
    );
  }

  // --- Internals ---

  private update$(fn: (f: JobFilters) => JobFilters): void {
    this.filters.update(fn);
    this.reset();
  }

  private reset(): void {
    this.page.set(1);
    this.changed$.next();
  }

  /** What gets saved: the filters on screen (including text still waiting for its pause) and the sorting. */
  private snapshot() {
    const [sort, order] = this.sortValue().split(':');
    return { filters: { ...this.filters(), ...this.pendingText }, sort, order };
  }

  /** Fills in anything a saved filter lacks (for example, filters saved before a new field existed). */
  private normalise(f: Partial<JobFilters>): JobFilters {
    const base = emptyFilters();
    return {
      ...base,
      ...f,
      applied: { ...base.applied, ...(f.applied ?? {}) },
      interview: { ...base.interview, ...(f.interview ?? {}) }
    };
  }
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
