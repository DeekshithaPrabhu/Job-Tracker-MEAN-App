import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { EVENT_COLORS, JobEvent, eventLabel, isActive } from './event.model';
import { Job, JobStatus, PRIORITY_COLORS, STATUSES, STATUS_COLORS, formatSalary } from './job.model';
import { JobContactsComponent } from './job-contacts.component';
import { JobDocumentsComponent } from './job-documents.component';
import { JobNotesComponent } from './job-notes.component';
import { ScheduleStore } from './schedule.store';

type Tab = 'overview' | 'notes' | 'people' | 'documents';

@Component({
  selector: 'app-job-detail',
  standalone: true,
  imports: [DatePipe, JobNotesComponent, JobContactsComponent, JobDocumentsComponent],
  template: `
    <div class="scrim" (click)="closed.emit()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" [attr.aria-label]="job().title + ' at ' + job().company">
      <header class="drawer-head">
        <div class="head-title">
          <h2>{{ job().company }}</h2>
          <p class="muted">{{ job().title }}</p>
        </div>
        <div class="head-actions">
          <button type="button" class="icon fav" [class.on]="job().isFavorite" (click)="favorite.emit()"
                  [attr.aria-pressed]="job().isFavorite"
                  [attr.aria-label]="job().isFavorite ? 'Remove from favorites' : 'Add to favorites'">
            {{ job().isFavorite ? '★' : '☆' }}
          </button>
          <button type="button" class="btn ghost small" (click)="closed.emit()">Done</button>
        </div>
      </header>

      <div class="drawer-body">
        <nav class="tabs" role="tablist" aria-label="Job sections">
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'overview'" [class.on]="tab() === 'overview'" (click)="tab.set('overview')">Overview</button>
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'notes'" [class.on]="tab() === 'notes'" (click)="tab.set('notes')">
            Notes @if (hasNotes()) { <span class="tab-dot" aria-label="has notes"></span> }
          </button>
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'people'" [class.on]="tab() === 'people'" (click)="tab.set('people')">
            People @if (contactCount()) { <span class="tab-count">{{ contactCount() }}</span> }
          </button>
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'documents'" [class.on]="tab() === 'documents'" (click)="tab.set('documents')">
            Documents @if (docCount()) { <span class="tab-count">{{ docCount() }}</span> }
          </button>
        </nav>

        @if (tab() === 'overview') {
        <section class="panel">
          <h3>Status</h3>
          <div class="status-row">
            <span class="status-pill big" [style.--c]="color(job().status)">
              <span class="dot"></span><strong>{{ job().status }}</strong>
            </span>
            <span class="muted small-text">since {{ job().statusChangedAt | date: 'd MMM y' }}</span>
          </div>

          <div class="status-form">
            <label class="field">
              <span>Move to</span>
              <select (change)="draft.set($any($event.target).value)">
                @for (s of statuses; track s) { <option [value]="s" [selected]="s === target()">{{ s }}</option> }
              </select>
            </label>
            <label class="field">
              <span>Note</span>
              <input type="text" placeholder="Optional, for example: phone screen with Dana"
                     [value]="note()" (input)="note.set($any($event.target).value)" maxlength="500" />
            </label>
            <button type="button" class="btn primary" [disabled]="target() === job().status" (click)="apply()">
              Update status
            </button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h3>Schedule</h3>
            <button type="button" class="btn small" (click)="schedule()">Add event</button>
          </div>
          @if (events().length) {
            <ul class="mini-events">
              @for (e of events(); track e._id) {
                <li>
                  <button type="button" class="mini-ev" [class.closed]="!isActive(e)" [style.--c]="evColor(e)"
                          (click)="store.openDetail(e._id)">
                    <span class="dot"></span>
                    <span class="mini-main">
                      <strong>{{ evLabel(e) }}</strong>
                      <span class="muted small-text">{{ e.startsAt | date: 'EEE d MMM, h:mm a' }}</span>
                    </span>
                    @if (e.status !== 'Scheduled') { <span class="badge" [attr.data-status]="e.status">{{ e.status }}</span> }
                  </button>
                </li>
              }
            </ul>
          } @else {
            <p class="muted">No interviews, calls or follow-ups yet.</p>
          }
        </section>

        <section class="panel">
          <h3>Status history</h3>
          @if (history().length) {
            <ol class="timeline">
              @for (h of history(); track $index) {
                <li [style.--c]="color(h.to)">
                  <span class="pip"></span>
                  <div class="t-main">
                    <strong>{{ h.to }}</strong>
                    <span class="muted small-text">
                      {{ h.from ? 'Moved from ' + h.from : 'Added to your tracker' }}
                    </span>
                    @if (h.note) { <p class="t-note">{{ h.note }}</p> }
                  </div>
                  <time class="muted small-text" [attr.datetime]="h.changedAt">{{ h.changedAt | date: 'd MMM y, h:mm a' }}</time>
                </li>
              }
            </ol>
          } @else {
            <p class="muted">No status changes recorded yet. Moves you make from now on appear here.</p>
          }
        </section>

        <section class="panel">
          <h3>Details</h3>
          <dl class="kv">
            @if (job().location) { <dt>Location</dt><dd>{{ job().location }}</dd> }
            <dt>Priority</dt>
            <dd><span class="chip" [style.--c]="priorityColor()"><span class="prio-dot"></span>{{ job().priority || 'Medium' }}</span></dd>
            <dt>Work mode</dt><dd>{{ job().workMode }}</dd>
            <dt>Employment</dt><dd>{{ job().employmentType }}</dd>
            <dt>Experience</dt><dd>{{ job().experienceLevel }}</dd>
            @if (salary()) { <dt>Salary</dt><dd>{{ salary() }}</dd> }
            <dt>Date saved</dt><dd>{{ job().dateSaved | date: 'd MMM y' }}</dd>
            @if (job().appliedAt) { <dt>Date applied</dt><dd>{{ job().appliedAt | date: 'd MMM y' }}</dd> }
            @if (job().postingUrl) {
              <dt>Posting</dt>
              <dd><a [href]="job().postingUrl" target="_blank" rel="noopener noreferrer">Open job posting</a></dd>
            }
          </dl>

          @if (job().skills.length) {
            <ul class="skills" aria-label="Required skills">
              @for (s of job().skills; track s) { <li>{{ s }}</li> }
            </ul>
          }

          @if (job().description) {
            <h3 class="sub-h">Job description</h3>
            <p class="desc">{{ job().description }}</p>
          }
        </section>

        @if (hasRecruiter()) {
          <section class="panel">
            <h3>Recruiter</h3>
            <dl class="kv">
              @if (job().recruiter?.name) { <dt>Name</dt><dd>{{ job().recruiter?.name }}</dd> }
              @if (job().recruiter?.email) {
                <dt>Email</dt><dd><a [href]="'mailto:' + job().recruiter?.email">{{ job().recruiter?.email }}</a></dd>
              }
              @if (job().recruiter?.phone) {
                <dt>Phone</dt><dd><a [href]="'tel:' + job().recruiter?.phone">{{ job().recruiter?.phone }}</a></dd>
              }
              @if (job().recruiter?.linkedin) {
                <dt>Profile</dt>
                <dd><a [href]="job().recruiter?.linkedin" target="_blank" rel="noopener noreferrer">View profile</a></dd>
              }
            </dl>
          </section>
        }

        } @else if (tab() === 'notes') {
          <app-job-notes [job]="job()" (updated)="jobUpdated.emit($event)" />
        } @else if (tab() === 'people') {
          <app-job-contacts [job]="job()" (updated)="jobUpdated.emit($event)" />
        } @else {
          <app-job-documents [job]="job()" (updated)="jobUpdated.emit($event)" />
        }

        <footer class="detail-actions">
          <button type="button" class="btn" (click)="edit.emit()">Edit</button>
          <button type="button" class="btn" (click)="archive.emit()">{{ job().isArchived ? 'Restore' : 'Archive' }}</button>
          <button type="button" class="btn danger" (click)="remove.emit()">Delete</button>
        </footer>
      </div>
    </aside>
  `
})
export class JobDetailComponent {
  readonly store = inject(ScheduleStore);
  readonly isActive = isActive;

  readonly job = input.required<Job>();

  readonly closed = output<void>();
  readonly edit = output<void>();
  readonly favorite = output<void>();
  readonly archive = output<void>();
  readonly remove = output<void>();
  readonly statusChange = output<{ status: JobStatus; note: string }>();
  /** Fired when notes, contacts or documents change; carries the updated job. */
  readonly jobUpdated = output<Job>();

  readonly tab = signal<Tab>('overview');
  readonly contactCount = computed(() => this.job().contacts?.length ?? 0);
  readonly docCount = computed(() => this.job().documents?.length ?? 0);
  readonly hasNotes = computed(() => !!(this.job().companyNotes?.trim() || this.job().recruiterNotes?.trim()));

  readonly statuses = STATUSES;
  priorityColor(): string {
    return PRIORITY_COLORS[this.job().priority ?? 'Medium'];
  }
  readonly draft = signal<JobStatus | null>(null);
  readonly note = signal('');

  readonly target = computed(() => this.draft() ?? this.job().status);
  readonly history = computed(() => [...(this.job().statusHistory ?? [])].reverse());
  readonly salary = computed(() => formatSalary(this.job().salary));
  readonly hasRecruiter = computed(() => {
    const r = this.job().recruiter;
    return !!(r && (r.name || r.email || r.phone || r.linkedin));
  });

  /** This job's events: upcoming first (soonest at the top), then finished ones (latest first). */
  readonly events = computed<JobEvent[]>(() => {
    const list = this.store.eventsForJob(this.job()._id);
    const time = (e: JobEvent) => new Date(e.startsAt).getTime();
    const open = list.filter(isActive).sort((a, b) => time(a) - time(b));
    const closed = list.filter((e) => !isActive(e)).sort((a, b) => time(b) - time(a));
    return [...open, ...closed];
  });

  schedule(): void {
    this.store.openForm({ jobId: this.job()._id });
  }

  evLabel(e: JobEvent): string {
    return eventLabel(e);
  }

  evColor(e: JobEvent): string {
    return EVENT_COLORS[e.type];
  }

  color(status: JobStatus): string {
    return STATUS_COLORS[status] ?? STATUS_COLORS['Saved / Interested'];
  }

  apply(): void {
    if (this.target() === this.job().status) return;
    this.statusChange.emit({ status: this.target(), note: this.note().trim() });
    this.draft.set(null);
    this.note.set('');
  }
}
