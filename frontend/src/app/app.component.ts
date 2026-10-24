import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime } from 'rxjs';
import { EventDetailComponent } from './event-detail.component';
import { EventFormComponent } from './event-form.component';
import { JobDetailComponent } from './job-detail.component';
import { JobFormComponent } from './job-form.component';
import {
  EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, Job, JobStats, JobStatus, JobView, STATUSES, STATUS_COLORS,
  WORK_MODES, formatSalary
} from './job.model';
import { JobService } from './job.service';
import { RemindersComponent } from './reminders.component';
import { ScheduleComponent } from './schedule.component';
import { ScheduleStore } from './schedule.store';

type Layout = 'board' | 'table';
type Page = 'applications' | 'schedule';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    DatePipe, CdkDropListGroup, CdkDropList, CdkDrag, JobFormComponent, JobDetailComponent,
    ScheduleComponent, EventFormComponent, EventDetailComponent, RemindersComponent
  ],
  template: `
    <header class="nav">
      <div class="nav-inner">
        <span class="brand">Job tracker</span>
        <nav class="segmented" aria-label="Pages">
          <button type="button" [class.on]="page() === 'applications'" [attr.aria-current]="page() === 'applications' ? 'page' : null" (click)="setPage('applications')">Applications</button>
          <button type="button" [class.on]="page() === 'schedule'" [attr.aria-current]="page() === 'schedule' ? 'page' : null" (click)="setPage('schedule')">Schedule</button>
        </nav>
        @if (page() === 'applications') {
          <button type="button" class="btn primary" (click)="openForm(null)">Save a job</button>
        } @else {
          <button type="button" class="btn primary" (click)="store.openForm()">Schedule event</button>
        }
      </div>
    </header>

    @if (page() === 'applications') {
      <section class="hero">
        <h1>Applications</h1>
        <p class="sub">
          {{ layout() === 'board' ? 'Drag a card to a new column to update its status.' : 'Change a status from the dropdown in any row.' }}
        </p>
      </section>

      <section class="toolbar" aria-label="Filters">
        <div class="segmented" role="group" aria-label="Job list">
          @for (v of views; track v.id) {
            <button type="button" [class.on]="view() === v.id" [attr.aria-pressed]="view() === v.id" (click)="setView(v.id)">
              {{ v.label }}<span class="count">{{ stats()[v.id] }}</span>
            </button>
          }
        </div>

        <input class="pill-input" type="search" placeholder="Search company, title, skill" aria-label="Search"
               (input)="search$.next($any($event.target).value)" />

        @if (layout() === 'table') {
          <select class="pill-select" aria-label="Status" (change)="setFilter('status', $any($event.target).value)">
            <option value="">Any status</option>
            @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
          </select>
        }
        <select class="pill-select" aria-label="Work mode" (change)="setFilter('workMode', $any($event.target).value)">
          <option value="">Any work mode</option>
          @for (m of workModes; track m) { <option [value]="m">{{ m }}</option> }
        </select>
        <select class="pill-select" aria-label="Employment type" (change)="setFilter('employmentType', $any($event.target).value)">
          <option value="">Any type</option>
          @for (t of employmentTypes; track t) { <option [value]="t">{{ t }}</option> }
        </select>
        <select class="pill-select" aria-label="Experience level" (change)="setFilter('experienceLevel', $any($event.target).value)">
          <option value="">Any level</option>
          @for (l of levels; track l) { <option [value]="l">{{ l }}</option> }
        </select>
        <select class="pill-select" aria-label="Sort by" (change)="setSort($any($event.target).value)">
          <option value="dateSaved:desc">Newest saved</option>
          <option value="dateSaved:asc">Oldest saved</option>
          <option value="company:asc">Company A to Z</option>
          <option value="title:asc">Job title A to Z</option>
        </select>

        <div class="segmented push-right" role="group" aria-label="Layout">
          <button type="button" [class.on]="layout() === 'board'" [attr.aria-pressed]="layout() === 'board'" (click)="setLayout('board')">Board</button>
          <button type="button" [class.on]="layout() === 'table'" [attr.aria-pressed]="layout() === 'table'" (click)="setLayout('table')">Table</button>
        </div>
      </section>

      <main class="page" aria-live="polite">
        @if (error()) { <p class="banner err" role="alert">{{ error() }}</p> }

        @if (layout() === 'board') {
          <div class="board" cdkDropListGroup>
            @for (col of columns(); track col.status) {
              <section class="column" [style.--c]="color(col.status)" [attr.aria-label]="col.status">
                <header class="col-head">
                  <span class="dot"></span>
                  <h2>{{ col.status }}</h2>
                  <span class="col-count">{{ col.jobs.length }}</span>
                </header>

                <ul class="col-list" cdkDropList cdkDropListSortingDisabled [cdkDropListData]="col.status"
                    (cdkDropListDropped)="onDrop($event)">
                  @for (job of col.jobs; track job._id) {
                    <li class="slot" cdkDrag [cdkDragData]="job" (cdkDragStarted)="dragging = true" (cdkDragEnded)="endDrag()">
                      <article class="card" tabindex="0" role="button"
                               [attr.aria-label]="job.title + ' at ' + job.company + ', ' + job.status"
                               (click)="select(job)" (keydown.enter)="select(job)">
                        <div class="card-top">
                          <div class="who">
                            <span class="company">{{ job.company }}</span>
                            <span class="title">{{ job.title }}</span>
                          </div>
                          <button type="button" class="icon fav" [class.on]="job.isFavorite"
                                  [attr.aria-pressed]="job.isFavorite"
                                  [attr.aria-label]="(job.isFavorite ? 'Remove from favorites: ' : 'Add to favorites: ') + job.title"
                                  (click)="toggleFavorite(job, $event)" (keydown.enter)="$event.stopPropagation()">
                            {{ job.isFavorite ? '★' : '☆' }}
                          </button>
                        </div>

                        <div class="chips">
                          <span class="chip"><span class="mode-dot" [attr.data-mode]="job.workMode"></span>{{ job.workMode }}</span>
                          <span class="chip">{{ job.employmentType }}</span>
                          @if (job.location) { <span class="chip">{{ job.location }}</span> }
                        </div>

                        @if (salary(job)) { <p class="salary">{{ salary(job) }}</p> }

                        @if (job.skills.length) {
                          <ul class="skills" aria-label="Required skills">
                            @for (s of job.skills.slice(0, 3); track s) { <li>{{ s }}</li> }
                            @if (job.skills.length > 3) { <li class="more">+{{ job.skills.length - 3 }}</li> }
                          </ul>
                        }

                        <p class="foot">In this stage since {{ (job.statusChangedAt || job.dateSaved) | date: 'd MMM' }}</p>
                      </article>
                    </li>
                  } @empty {
                    <li class="col-empty">{{ loading() ? 'Loading' : 'Drop a card here' }}</li>
                  }
                </ul>
              </section>
            }
          </div>
        } @else {
          @if (!jobs().length) {
            <div class="empty">
              <strong>{{ loading() ? 'Loading your jobs' : emptyTitle() }}</strong>
              @if (!loading()) { <p>{{ emptyHint() }}</p> }
            </div>
          } @else {
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th scope="col">Company</th>
                    <th scope="col">Status</th>
                    <th scope="col">Work mode</th>
                    <th scope="col">Type</th>
                    <th scope="col">Salary</th>
                    <th scope="col">Saved</th>
                    <th scope="col">Status changed</th>
                    <th scope="col"><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (job of jobs(); track job._id) {
                    <tr tabindex="0" (click)="select(job)" (keydown.enter)="select(job)">
                      <td>
                        <span class="company">{{ job.company }}</span>
                        <span class="title block">{{ job.title }}</span>
                      </td>
                      <td (click)="$event.stopPropagation()" (keydown.enter)="$event.stopPropagation()">
                        <span class="status-pill" [style.--c]="color(job.status)">
                          <span class="dot"></span>
                          <select [attr.aria-label]="'Status for ' + job.title" (change)="changeStatus(job, $any($event.target).value)">
                            @for (s of statuses; track s) { <option [value]="s" [selected]="s === job.status">{{ s }}</option> }
                          </select>
                        </span>
                      </td>
                      <td><span class="chip"><span class="mode-dot" [attr.data-mode]="job.workMode"></span>{{ job.workMode }}</span></td>
                      <td>{{ job.employmentType }}</td>
                      <td>{{ salary(job) || 'Not listed' }}</td>
                      <td>{{ job.dateSaved | date: 'd MMM y' }}</td>
                      <td>{{ (job.statusChangedAt || job.dateSaved) | date: 'd MMM y' }}</td>
                      <td class="row-actions" (click)="$event.stopPropagation()" (keydown.enter)="$event.stopPropagation()">
                        <button type="button" class="icon fav" [class.on]="job.isFavorite" [attr.aria-pressed]="job.isFavorite"
                                [attr.aria-label]="(job.isFavorite ? 'Remove from favorites: ' : 'Add to favorites: ') + job.title"
                                (click)="toggleFavorite(job, $event)">{{ job.isFavorite ? '★' : '☆' }}</button>
                        @if (job.postingUrl) {
                          <a class="btn small ghost" [href]="job.postingUrl" target="_blank" rel="noopener noreferrer">Posting</a>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </main>
    } @else {
      <app-schedule />
    }

    @if (selected(); as job) {
      <app-job-detail
        [job]="job"
        (closed)="selectedId.set(null)"
        (edit)="openForm(job)"
        (favorite)="toggleFavorite(job)"
        (archive)="toggleArchive(job)"
        (remove)="remove(job)"
        (statusChange)="changeStatus(job, $event.status, $event.note)" />
    }

    @if (formOpen()) {
      <app-job-form [job]="editing()" (saved)="onSaved()" (closed)="closeForm()" />
    }

    @if (store.detail(); as ev) {
      <app-event-detail [event]="ev" />
    }

    @if (store.form().open) {
      <app-event-form />
    }

    <app-reminders />
  `
})
export class AppComponent {
  readonly store = inject(ScheduleStore);
  private readonly api = inject(JobService);
  private readonly destroyRef = inject(DestroyRef);

  readonly views: { id: JobView; label: string }[] = [
    { id: 'active', label: 'Active' },
    { id: 'favorites', label: 'Favorites' },
    { id: 'archived', label: 'Archived' }
  ];
  readonly statuses = STATUSES;
  readonly workModes = WORK_MODES;
  readonly employmentTypes = EMPLOYMENT_TYPES;
  readonly levels = EXPERIENCE_LEVELS;

  readonly jobs = signal<Job[]>([]);
  readonly stats = signal<JobStats>({ active: 0, favorites: 0, archived: 0 });
  readonly view = signal<JobView>('active');
  readonly page = signal<Page>('applications');
  readonly layout = signal<Layout>(this.savedLayout());
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly editing = signal<Job | null>(null);

  readonly selected = computed(() => this.jobs().find((j) => j._id === this.selectedId()) ?? null);
  readonly columns = computed(() =>
    STATUSES.map((status) => ({
      status,
      jobs: this.jobs().filter((j) => (j.status ?? STATUSES[0]) === status)
    }))
  );

  readonly search$ = new Subject<string>();
  dragging = false;

  private filters = { search: '', status: '', workMode: '', employmentType: '', experienceLevel: '' };
  private sort = { sort: 'dateSaved', order: 'desc' as 'asc' | 'desc' };

  constructor() {
    this.search$.pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      this.filters.search = value.trim();
      this.load();
    });
    // Scheduling or completing an interview can move a job along the pipeline.
    this.store.jobsChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
    this.load();
    this.store.load();
  }

  setPage(page: Page): void {
    this.page.set(page);
  }

  color(status: JobStatus): string {
    return STATUS_COLORS[status] ?? STATUS_COLORS[STATUSES[0]];
  }

  salary(job: Job): string {
    return formatSalary(job.salary);
  }

  private activeFilters() {
    // The status filter only applies to the table; the board already has a column per status.
    return { ...this.filters, status: this.layout() === 'table' ? this.filters.status : '' };
  }

  private hasFilters(): boolean {
    return Object.values(this.activeFilters()).some(Boolean);
  }

  emptyTitle(): string {
    if (this.hasFilters()) return 'No jobs match these filters';
    return { active: 'No saved jobs yet', favorites: 'No favorites yet', archived: 'Nothing archived' }[this.view()];
  }

  emptyHint(): string {
    if (this.hasFilters()) return 'Clear a filter or try a different search.';
    return {
      active: 'Choose Save a job to start tracking one.',
      favorites: 'Tap the star on a job to keep it here.',
      archived: 'Archived jobs show up here and can be restored any time.'
    }[this.view()];
  }

  load(): void {
    this.loading.set(true);
    this.api.list({ view: this.view(), ...this.activeFilters(), ...this.sort }).subscribe({
      next: (jobs) => {
        this.jobs.set(jobs);
        this.error.set('');
        this.loading.set(false);
      },
      error: () => this.fail('Could not load jobs. Check that the API is running on port 3000.')
    });
    this.api.stats().subscribe({ next: (s) => this.stats.set(s), error: () => undefined });
  }

  setLayout(layout: Layout): void {
    this.layout.set(layout);
    try { localStorage.setItem('job-tracker:layout', layout); } catch { /* storage unavailable */ }
    this.load();
  }

  setView(view: JobView): void {
    this.view.set(view);
    this.load();
  }

  setFilter(key: 'status' | 'workMode' | 'employmentType' | 'experienceLevel', value: string): void {
    this.filters[key] = value;
    this.load();
  }

  setSort(value: string): void {
    const [sort, order] = value.split(':');
    this.sort = { sort, order: order as 'asc' | 'desc' };
    this.load();
  }

  // --- Detail / form ---

  select(job: Job): void {
    if (this.dragging) return;
    this.selectedId.set(job._id);
  }

  endDrag(): void {
    // Keep the click that follows a drag from opening the detail sheet.
    setTimeout(() => (this.dragging = false), 0);
  }

  openForm(job: Job | null): void {
    this.selectedId.set(null);
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

  // --- Pipeline ---

  onDrop(event: CdkDragDrop<JobStatus, JobStatus, Job>): void {
    if (event.previousContainer === event.container) return;
    this.changeStatus(event.item.data, event.container.data);
  }

  changeStatus(job: Job, status: JobStatus, note = ''): void {
    if (job.status === status) return;
    const before = this.jobs();
    const now = new Date().toISOString();

    // Update the screen right away, then confirm with the server.
    this.jobs.update((list) =>
      list.map((j) =>
        j._id === job._id
          ? {
              ...j,
              status,
              statusChangedAt: now,
              statusHistory: [...(j.statusHistory ?? []), { from: j.status, to: status, changedAt: now, note }]
            }
          : j
      )
    );

    this.api.setStatus(job._id, status, note).subscribe({
      next: (saved) => {
        this.jobs.update((list) => list.map((j) => (j._id === saved._id ? saved : j)));
        this.error.set('');
      },
      error: () => {
        this.jobs.set(before);
        this.fail(`Could not move "${job.title}" to ${status}. It was put back where it was.`);
      }
    });
  }

  // --- Other actions ---

  toggleFavorite(job: Job, event?: Event): void {
    event?.stopPropagation();
    this.api.setFavorite(job._id, !job.isFavorite).subscribe({
      next: () => this.load(),
      error: () => this.fail('Could not update the favorite. Try again.')
    });
  }

  toggleArchive(job: Job): void {
    this.api.setArchived(job._id, !job.isArchived).subscribe({
      next: () => {
        this.selectedId.set(null);
        this.load();
      },
      error: () => this.fail(`Could not ${job.isArchived ? 'restore' : 'archive'} the job. Try again.`)
    });
  }

  remove(job: Job): void {
    if (!confirm(`Delete "${job.title}" at ${job.company}? This cannot be undone.`)) return;
    this.api.remove(job._id).subscribe({
      next: () => {
        this.selectedId.set(null);
        this.load();
        this.store.load(); // its interviews and follow-ups are deleted with it
      },
      error: () => this.fail('Could not delete the job. Try again.')
    });
  }

  private savedLayout(): Layout {
    try {
      return localStorage.getItem('job-tracker:layout') === 'table' ? 'table' : 'board';
    } catch {
      return 'board';
    }
  }

  private fail(message: string): void {
    this.error.set(message);
    this.loading.set(false);
  }
}
