import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime } from 'rxjs';
import { JobFormComponent } from './job-form.component';
import {
  EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, Job, JobStats, JobView, WORK_MODES
} from './job.model';
import { JobService } from './job.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DatePipe, JobFormComponent],
  template: `
    <header class="top">
      <div>
        <h1>Job tracker</h1>
        <p class="sub">Every opportunity you are considering, in one place.</p>
      </div>
      <button type="button" class="btn primary" (click)="openForm(null)">Save a job</button>
    </header>

    <div class="layout">
      <aside class="rail" aria-label="Filters">
        <nav class="views" aria-label="Job lists">
          @for (v of views; track v.id) {
            <button type="button" [class.on]="view() === v.id" [attr.aria-pressed]="view() === v.id" (click)="setView(v.id)">
              <span>{{ v.label }}</span>
              <span class="count">{{ stats()[v.id] }}</span>
            </button>
          }
        </nav>

        <div class="filters">
          <label class="field">
            <span>Search</span>
            <input type="search" placeholder="Company, title, skill…" (input)="search$.next($any($event.target).value)" />
          </label>
          <label class="field">
            <span>Work mode</span>
            <select (change)="setFilter('workMode', $any($event.target).value)">
              <option value="">Any</option>
              @for (m of workModes; track m) { <option [value]="m">{{ m }}</option> }
            </select>
          </label>
          <label class="field">
            <span>Employment type</span>
            <select (change)="setFilter('employmentType', $any($event.target).value)">
              <option value="">Any</option>
              @for (t of employmentTypes; track t) { <option [value]="t">{{ t }}</option> }
            </select>
          </label>
          <label class="field">
            <span>Experience level</span>
            <select (change)="setFilter('experienceLevel', $any($event.target).value)">
              <option value="">Any</option>
              @for (l of levels; track l) { <option [value]="l">{{ l }}</option> }
            </select>
          </label>
          <label class="field">
            <span>Sort by</span>
            <select (change)="setSort($any($event.target).value)">
              <option value="dateSaved:desc">Newest saved</option>
              <option value="dateSaved:asc">Oldest saved</option>
              <option value="company:asc">Company A–Z</option>
              <option value="title:asc">Job title A–Z</option>
            </select>
          </label>
        </div>
      </aside>

      <main class="results" aria-live="polite">
        @if (error()) { <p class="banner err" role="alert">{{ error() }}</p> }

        @if (loading() && !jobs().length) {
          <p class="empty">Loading your jobs…</p>
        } @else if (!jobs().length) {
          <div class="empty">
            <strong>{{ emptyTitle() }}</strong>
            <p>{{ emptyHint() }}</p>
            @if (view() === 'active' && !hasFilters()) {
              <button type="button" class="btn primary" (click)="openForm(null)">Save your first job</button>
            }
          </div>
        } @else {
          <ul class="jobs">
            @for (job of jobs(); track job._id) {
              <li class="job" [attr.data-mode]="job.workMode" [class.archived]="job.isArchived">
                <div class="job-main">
                  <button type="button" class="job-toggle" (click)="toggleExpanded(job._id)"
                          [attr.aria-expanded]="expandedId() === job._id">
                    <span class="company">{{ job.company }}</span>
                    <span class="title">{{ job.title }}</span>
                  </button>

                  <div class="meta">
                    @if (job.location) { <span>{{ job.location }}</span> }
                    <span class="mode">{{ job.workMode }}</span>
                    <span>{{ job.employmentType }}</span>
                    <span>{{ job.experienceLevel }} level</span>
                    @if (salary(job)) { <span class="salary">{{ salary(job) }}</span> }
                    <span class="saved">Saved {{ job.dateSaved | date: 'd MMM y' }}</span>
                  </div>

                  @if (job.skills.length) {
                    <ul class="skills" aria-label="Required skills">
                      @for (s of job.skills; track s) { <li>{{ s }}</li> }
                    </ul>
                  }

                  @if (expandedId() === job._id) {
                    <div class="details">
                      @if (job.description) {
                        <h3>Job description</h3>
                        <p class="desc">{{ job.description }}</p>
                      }
                      @if (job.recruiter?.name || job.recruiter?.email || job.recruiter?.phone || job.recruiter?.linkedin) {
                        <h3>Recruiter</h3>
                        <p class="recruiter">
                          @if (job.recruiter?.name) { <strong>{{ job.recruiter?.name }}</strong> }
                          @if (job.recruiter?.email) { <a [href]="'mailto:' + job.recruiter?.email">{{ job.recruiter?.email }}</a> }
                          @if (job.recruiter?.phone) { <a [href]="'tel:' + job.recruiter?.phone">{{ job.recruiter?.phone }}</a> }
                          @if (job.recruiter?.linkedin) { <a [href]="job.recruiter?.linkedin" target="_blank" rel="noopener noreferrer">Profile</a> }
                        </p>
                      }
                      @if (!job.description && !job.recruiter?.name && !job.recruiter?.email && !job.recruiter?.phone && !job.recruiter?.linkedin) {
                        <p class="desc muted">No description or recruiter details yet. Use Edit to add them.</p>
                      }
                    </div>
                  }
                </div>

                <div class="actions">
                  <button type="button" class="icon fav" [class.on]="job.isFavorite" (click)="toggleFavorite(job)"
                          [attr.aria-pressed]="job.isFavorite"
                          [attr.aria-label]="(job.isFavorite ? 'Remove from favorites: ' : 'Add to favorites: ') + job.title">
                    {{ job.isFavorite ? '★' : '☆' }}
                  </button>
                  @if (job.postingUrl) {
                    <a class="btn small ghost" [href]="job.postingUrl" target="_blank" rel="noopener noreferrer">Open posting</a>
                  }
                  <button type="button" class="btn small ghost" (click)="openForm(job)">Edit</button>
                  <button type="button" class="btn small ghost" (click)="toggleArchive(job)">
                    {{ job.isArchived ? 'Restore' : 'Archive' }}
                  </button>
                  <button type="button" class="btn small danger" (click)="remove(job)">Delete</button>
                </div>
              </li>
            }
          </ul>
        }
      </main>
    </div>

    @if (formOpen()) {
      <app-job-form [job]="editing()" (saved)="onSaved()" (closed)="closeForm()" />
    }
  `
})
export class AppComponent {
  private readonly api = inject(JobService);
  private readonly destroyRef = inject(DestroyRef);

  readonly views: { id: JobView; label: string }[] = [
    { id: 'active', label: 'Active' },
    { id: 'favorites', label: 'Favorites' },
    { id: 'archived', label: 'Archived' }
  ];
  readonly workModes = WORK_MODES;
  readonly employmentTypes = EMPLOYMENT_TYPES;
  readonly levels = EXPERIENCE_LEVELS;

  readonly jobs = signal<Job[]>([]);
  readonly stats = signal<JobStats>({ active: 0, favorites: 0, archived: 0 });
  readonly view = signal<JobView>('active');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly expandedId = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly editing = signal<Job | null>(null);

  readonly search$ = new Subject<string>();
  private filters = { search: '', workMode: '', employmentType: '', experienceLevel: '' };
  private sort = { sort: 'dateSaved', order: 'desc' as 'asc' | 'desc' };

  constructor() {
    this.search$.pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      this.filters.search = value.trim();
      this.load();
    });
    this.load();
  }

  hasFilters(): boolean {
    return Object.values(this.filters).some(Boolean);
  }

  emptyTitle(): string {
    if (this.hasFilters()) return 'No jobs match these filters';
    return { active: 'No saved jobs yet', favorites: 'No favorites yet', archived: 'Nothing archived' }[this.view()];
  }

  emptyHint(): string {
    if (this.hasFilters()) return 'Clear a filter or try a different search.';
    return {
      active: 'Save a job to start tracking it here.',
      favorites: 'Tap the star on a job to keep it here.',
      archived: 'Archived jobs show up here and can be restored any time.'
    }[this.view()];
  }

  load(): void {
    this.loading.set(true);
    this.api
      .list({ view: this.view(), ...this.filters, ...this.sort })
      .subscribe({
        next: (jobs) => {
          this.jobs.set(jobs);
          this.error.set('');
          this.loading.set(false);
        },
        error: () => this.fail('Could not load jobs. Check that the API is running on port 3000.')
      });
    this.api.stats().subscribe({ next: (s) => this.stats.set(s), error: () => undefined });
  }

  setView(view: JobView): void {
    this.view.set(view);
    this.load();
  }

  setFilter(key: 'workMode' | 'employmentType' | 'experienceLevel', value: string): void {
    this.filters[key] = value;
    this.load();
  }

  setSort(value: string): void {
    const [sort, order] = value.split(':');
    this.sort = { sort, order: order as 'asc' | 'desc' };
    this.load();
  }

  toggleExpanded(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  openForm(job: Job | null): void {
    this.editing.set(job);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  onSaved(): void {
    this.closeForm();
    this.load();
  }

  toggleFavorite(job: Job): void {
    this.api.setFavorite(job._id, !job.isFavorite).subscribe({
      next: () => this.load(),
      error: () => this.fail('Could not update the favorite. Try again.')
    });
  }

  toggleArchive(job: Job): void {
    this.api.setArchived(job._id, !job.isArchived).subscribe({
      next: () => this.load(),
      error: () => this.fail(`Could not ${job.isArchived ? 'restore' : 'archive'} the job. Try again.`)
    });
  }

  remove(job: Job): void {
    if (!confirm(`Delete "${job.title}" at ${job.company}? This cannot be undone.`)) return;
    this.api.remove(job._id).subscribe({
      next: () => this.load(),
      error: () => this.fail('Could not delete the job. Try again.')
    });
  }

  salary(job: Job): string {
    const { min, max, currency } = job.salary ?? {};
    if (min == null && max == null) return '';
    const fmt = new Intl.NumberFormat('en', {
      style: 'currency', currency: currency || 'USD', notation: 'compact', maximumFractionDigits: 1
    });
    if (min != null && max != null) return `${fmt.format(min)} to ${fmt.format(max)}`;
    return min != null ? `From ${fmt.format(min)}` : `Up to ${fmt.format(max as number)}`;
  }

  private fail(message: string): void {
    this.error.set(message);
    this.loading.set(false);
  }
}
