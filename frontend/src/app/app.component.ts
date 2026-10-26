import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from './auth.service';
import { DashboardComponent } from './dashboard.component';
import { EventDetailComponent } from './event-detail.component';
import { EventFormComponent } from './event-form.component';
import { JobDetailComponent } from './job-detail.component';
import { JobFiltersComponent } from './job-filters.component';
import { JobFormComponent } from './job-form.component';
import { DEFAULT_SORT } from './job-query.model';
import { JobQueryStore } from './job-query.store';
import {
  Job, JobStats, JobStatus, JobView, PRIORITY_COLORS, Priority, STATUSES, STATUS_COLORS, formatSalary
} from './job.model';
import { JobService } from './job.service';
import { PagerComponent } from './pager.component';
import { ProfileComponent } from './profile.component';
import { RemindersComponent } from './reminders.component';
import { ScheduleComponent } from './schedule.component';
import { ScheduleStore } from './schedule.store';

type Layout = 'board' | 'table';
type Page = 'dashboard' | 'applications' | 'schedule' | 'profile';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    DatePipe, CdkDropListGroup, CdkDropList, CdkDrag, JobFormComponent, JobDetailComponent, JobFiltersComponent, PagerComponent, ProfileComponent,
    ScheduleComponent, DashboardComponent, EventFormComponent, EventDetailComponent, RemindersComponent
  ],
  template: `
    <header class="nav">
      <div class="nav-inner">
        <span class="brand">Job tracker</span>
        <nav class="segmented" aria-label="Pages">
          <button type="button" [class.on]="page() === 'dashboard'" [attr.aria-current]="page() === 'dashboard' ? 'page' : null" (click)="setPage('dashboard')">Dashboard</button>
          <button type="button" [class.on]="page() === 'applications'" [attr.aria-current]="page() === 'applications' ? 'page' : null" (click)="setPage('applications')">Applications</button>
          <button type="button" [class.on]="page() === 'schedule'" [attr.aria-current]="page() === 'schedule' ? 'page' : null" (click)="setPage('schedule')">Schedule</button>
        </nav>
        @if (page() === 'schedule') {
          <button type="button" class="btn primary" (click)="store.openForm()">Schedule event</button>
        } @else if (page() !== 'profile') {
          <button type="button" class="btn primary" (click)="openForm(null)">Save a job</button>
        }
        <div class="user-menu">
          <button type="button" class="user-name" [class.on]="page() === 'profile'" [attr.aria-current]="page() === 'profile' ? 'page' : null"
                  [attr.title]="auth.user()?.email" (click)="setPage('profile')">{{ auth.user()?.name }}</button>
          <button type="button" class="btn small ghost" (click)="auth.logout()">Sign out</button>
        </div>
      </div>
    </header>

    @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }

    @if (page() === 'applications') {
      <section class="hero">
        <h1>Applications</h1>
        <p class="sub">
          {{ layout() === 'board' ? 'Drag a card to a new column to update its status.' : 'Change a status from the dropdown in any row.' }}
        </p>
      </section>

      <section class="toolbar" aria-label="List and layout">
        <div class="segmented" role="group" aria-label="Job list">
          @for (v of views; track v.id) {
            <button type="button" [class.on]="view() === v.id" [attr.aria-pressed]="view() === v.id" (click)="setView(v.id)">
              {{ v.label }}<span class="count">{{ stats()[v.id] }}</span>
            </button>
          }
        </div>

        <div class="segmented push-right" role="group" aria-label="Layout">
          <button type="button" [class.on]="layout() === 'board'" [attr.aria-pressed]="layout() === 'board'" (click)="setLayout('board')">Board</button>
          <button type="button" [class.on]="layout() === 'table'" [attr.aria-pressed]="layout() === 'table'" (click)="setLayout('table')">Table</button>
        </div>
      </section>

      <app-job-filters [modified]="listModified()" (reset)="resetList()" />

      <main class="page" aria-live="polite">
        @if (error()) { <p class="banner err" role="alert">{{ error() }}</p> }

        @if (layout() === 'board') {
          @if (!jobs().length && !loading() && q.activeCount() > 0) {
            <div class="empty">
              <strong>{{ emptyTitle() }}</strong>
              <p>{{ emptyHint() }}</p>
            </div>
          }
          <div class="board" cdkDropListGroup>
            @for (col of columns(); track col.status) {
              <section class="column" [style.--c]="color(col.status)" [attr.aria-label]="col.status">
                <header class="col-head">
                  <span class="dot"></span>
                  <h2>{{ col.status }}</h2>
                  <span class="col-count" [attr.aria-label]="col.jobs.length === col.total ? col.total + ' jobs' : col.jobs.length + ' shown of ' + col.total + ' jobs'">{{ col.jobs.length === col.total ? col.total : col.jobs.length + ' of ' + col.total }}</span>
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
                          <span class="chip" [style.--c]="priorityColor(job.priority)"><span class="prio-dot"></span>{{ job.priority || 'Medium' }}</span>
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

                        @if (job.nextInterviewAt) {
                          <p class="foot next-int">Interview {{ job.nextInterviewAt | date: 'EEE d MMM, h:mm a' }}</p>
                        }
                        <p class="foot">
                          @if (job.appliedAt) { Applied {{ job.appliedAt | date: 'd MMM' }}. }
                          In this stage since {{ (job.statusChangedAt || job.dateSaved) | date: 'd MMM' }}
                        </p>
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
                    <th scope="col">Priority</th>
                    <th scope="col">Work mode</th>
                    <th scope="col">Salary</th>
                    <th scope="col">Applied</th>
                    <th scope="col">Next interview</th>
                    <th scope="col">Saved</th>
                    <th scope="col"><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (job of jobs(); track job._id) {
                    <tr tabindex="0" (click)="select(job)" (keydown.enter)="select(job)">
                      <td>
                        <span class="company">{{ job.company }}</span>
                        <span class="title block">{{ job.title }}</span>
                        @if (job.location) { <span class="title block">{{ job.location }}</span> }
                      </td>
                      <td (click)="$event.stopPropagation()" (keydown.enter)="$event.stopPropagation()">
                        <span class="status-pill" [style.--c]="color(job.status)">
                          <span class="dot"></span>
                          <select [attr.aria-label]="'Status for ' + job.title" (change)="changeStatus(job, $any($event.target).value)">
                            @for (s of statuses; track s) { <option [value]="s" [selected]="s === job.status">{{ s }}</option> }
                          </select>
                        </span>
                      </td>
                      <td><span class="chip" [style.--c]="priorityColor(job.priority)"><span class="prio-dot"></span>{{ job.priority || 'Medium' }}</span></td>
                      <td><span class="chip"><span class="mode-dot" [attr.data-mode]="job.workMode"></span>{{ job.workMode }}</span></td>
                      <td>{{ salary(job) || 'Not listed' }}</td>
                      <td>{{ job.appliedAt ? (job.appliedAt | date: 'd MMM y') : 'Not yet' }}</td>
                      <td>{{ job.nextInterviewAt ? (job.nextInterviewAt | date: 'd MMM, h:mm a') : 'None' }}</td>
                      <td>{{ job.dateSaved | date: 'd MMM y' }}</td>
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

        <app-pager />
      </main>
    } @else if (page() === 'schedule') {
      <app-schedule />
    } @else if (page() === 'profile') {
      <app-profile />
    } @else {
      <app-dashboard
        [refreshKey]="jobsVersion()"
        (openJob)="openJobById($event.id)"
        (goto)="setPage($event)"
        (saveJob)="openForm(null)" />
    }

    @if (selected(); as job) {
      <app-job-detail
        [job]="job"
        (closed)="selectedId.set(null)"
        (edit)="openForm(job)"
        (favorite)="toggleFavorite(job)"
        (archive)="toggleArchive(job)"
        (remove)="remove(job)"
        (statusChange)="changeStatus(job, $event.status, $event.note)"
        (jobUpdated)="onJobUpdated($event)" />
    }

    @if (formOpen()) {
      <app-job-form [job]="editing()" (saved)="onSaved($event)" (closed)="closeForm()" />
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
  readonly auth = inject(AuthService);
  readonly store = inject(ScheduleStore);
  private readonly api = inject(JobService);
  private readonly destroyRef = inject(DestroyRef);

  readonly views: { id: JobView; label: string }[] = [
    { id: 'active', label: 'Active' },
    { id: 'favorites', label: 'Favorites' },
    { id: 'archived', label: 'Archived' }
  ];
  readonly statuses = STATUSES;
  readonly q = inject(JobQueryStore);

  readonly jobs = signal<Job[]>([]);
  readonly stats = signal<JobStats>({ active: 0, favorites: 0, archived: 0 });
  readonly view = signal<JobView>('active');
  readonly page = signal<Page>('dashboard');
  /** Bumped whenever job data is reloaded or changed, so the dashboard refreshes its numbers. */
  readonly jobsVersion = signal(0);
  readonly layout = signal<Layout>(this.savedLayout());
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  private noticeTimer?: ReturnType<typeof setTimeout>;
  readonly selectedId = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly editing = signal<Job | null>(null);

  /** A job opened from the dashboard that is not on the current page of results. */
  private readonly outsideJob = signal<Job | null>(null);
  readonly selected = computed(
    () =>
      this.jobs().find((j) => j._id === this.selectedId()) ??
      (this.outsideJob()?._id === this.selectedId() ? this.outsideJob() : null)
  );
  /** One column per status (only the chosen statuses when a status filter is on), counted across all pages. */
  readonly columns = computed(() => {
    const chosen = this.q.filters().statuses;
    const counts = this.q.statusCounts();
    return STATUSES.filter((s) => !chosen.length || chosen.includes(s)).map((status) => ({
      status,
      jobs: this.jobs().filter((j) => (j.status ?? STATUSES[0]) === status),
      total: counts[status] ?? 0
    }));
  });

  dragging = false;
  private loadSeq = 0;

  constructor() {
    // Search, filters, sorting and paging all funnel through the query store.
    this.q.changed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
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

  priorityColor(priority: Priority | undefined): string {
    return PRIORITY_COLORS[priority ?? 'Medium'];
  }

  private hasFilters(): boolean {
    return this.q.activeCount() > 0;
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
    const seq = ++this.loadSeq; // a slower, older response must not overwrite a newer one
    this.loading.set(true);
    this.api.search({ view: this.view(), ...this.q.params() }).subscribe({
      next: (result) => {
        if (seq !== this.loadSeq) return;
        this.jobs.set(result.items);
        this.q.applyResult(result);
        this.error.set('');
        this.loading.set(false);
        this.jobsVersion.update((v) => v + 1);
        this.refreshOutsideJob(result.items);
      },
      error: () => {
        if (seq === this.loadSeq) this.fail('Could not load jobs.');
      }
    });
    this.api.stats().subscribe({ next: (s) => this.stats.set(s), error: () => undefined });
  }

  setLayout(layout: Layout): void {
    this.layout.set(layout);
    try { localStorage.setItem('job-tracker:layout', layout); } catch { /* storage unavailable */ }
  }

  setView(view: JobView): void {
    this.view.set(view);
    this.q.page.set(1);
    this.load();
  }

  // --- Detail / form ---

  select(job: Job): void {
    if (this.dragging) return;
    this.selectedId.set(job._id);
  }

  /** Opens a job's sheet from the dashboard, switching list if the job is archived. */
  openJobById(id: string): void {
    this.selectedId.set(id);
    if (this.jobs().some((j) => j._id === id)) return;
    // Filters or paging may hide the job, so fetch it directly instead of changing what the list shows.
    this.api.get(id).subscribe({
      next: (job) => this.outsideJob.set(job),
      error: () => {
        this.selectedId.set(null);
        this.fail('That job could not be found. It may have been deleted.');
      }
    });
  }

  /** True when anything differs from the default list: a search, filter, sort, other tab or later page. */
  readonly listModified = computed(
    () => this.q.activeCount() > 0 || this.q.sortValue() !== DEFAULT_SORT || this.view() !== 'active' || this.q.page() > 1
  );

  /** Back to the plain Active list (board or table, whichever is showing): no search, filters or custom sort. */
  resetList(): void {
    this.view.set('active');
    this.q.resetAll();
  }

  /** A note, contact or document changed: swap in the updated job without reloading the list. */
  onJobUpdated(job: Job): void {
    this.jobs.update((list) => list.map((j) => (j._id === job._id ? { ...job, nextInterviewAt: j.nextInterviewAt } : j)));
    if (this.outsideJob()?._id === job._id) this.outsideJob.set(job);
  }

  /** Keeps a job opened from outside the current page up to date after changes. */
  private refreshOutsideJob(items: Job[]): void {
    const outside = this.outsideJob();
    if (!outside || this.selectedId() !== outside._id || items.some((j) => j._id === outside._id)) return;
    this.api.get(outside._id).subscribe({ next: (job) => this.outsideJob.set(job), error: () => this.outsideJob.set(null) });
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

  onSaved(job: Job): void {
    this.closeForm();
    this.load();
    this.store.load(); // a status change in the form can cancel events
    this.announceCancelled(job);
  }

  // --- Pipeline ---

  onDrop(event: CdkDragDrop<JobStatus, JobStatus, Job>): void {
    if (event.previousContainer === event.container) return;
    this.changeStatus(event.item.data, event.container.data);
  }

  changeStatus(job: Job, status: JobStatus, note = ''): void {
    if (job.status === status) return;
    const before = this.jobs();
    const countsBefore = this.q.statusCounts();
    const now = new Date().toISOString();
    const counts = { ...countsBefore };
    counts[job.status] = Math.max(0, (counts[job.status] ?? 0) - 1);
    counts[status] = (counts[status] ?? 0) + 1;
    this.q.statusCounts.set(counts);

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
        if (this.outsideJob()?._id === saved._id) this.outsideJob.set(saved);
        this.error.set('');
        this.jobsVersion.update((v) => v + 1);
        if (saved.cancelledEvents) {
          this.store.load();
          this.announceCancelled(saved);
        }
      },
      error: () => {
        this.jobs.set(before);
        this.q.statusCounts.set(countsBefore);
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

  private announceCancelled(job: Job): void {
    const n = job.cancelledEvents ?? 0;
    if (!n) return;
    this.notice.set(`Withdrawn from ${job.company}. ${n} upcoming ${n === 1 ? 'event was' : 'events were'} cancelled.`);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 7000);
  }

  private fail(message: string): void {
    this.error.set(message);
    this.loading.set(false);
  }
}
