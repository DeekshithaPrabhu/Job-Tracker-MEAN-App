import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EVENT_COLORS, JobEvent, eventLabel, isActive, isFollowUpType, reminderLabel } from './event.model';
import { ScheduleStore } from './schedule.store';
import { allTimeZones, clockInZone, describeWhen, formatDuration, isValidTimeZone, relativeTime, utcToZoned, zonedToUtc } from './time.util';

@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  template: `
    <div class="scrim" (click)="store.closeDetail()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" [attr.aria-label]="label() + ' with ' + event().job.company">
      <header class="drawer-head">
        <div class="head-title">
          <h2>{{ label() }}</h2>
          <p class="muted">{{ event().job.company }}, {{ event().job.title }}</p>
        </div>
        <button type="button" class="btn ghost small" (click)="store.closeDetail()">Done</button>
      </header>

      <div class="drawer-body">
        <section class="panel" [style.--c]="color()">
          <div class="status-row">
            <span class="status-pill big"><span class="dot"></span><strong>{{ event().type }}{{ event().round ? ', ' + event().round : '' }}</strong></span>
            <span class="badge" [attr.data-status]="event().status">{{ event().status }}</span>
            @if (overdue()) { <span class="badge" data-status="Overdue">Needs an update</span> }
          </div>

          <div class="when">
            <strong class="when-main">{{ when().event }}</strong>
            @if (when().local) { <span class="muted">In your time zone: {{ when().local }}</span> }
            <span class="muted">
              {{ relative() }}{{ followUp() ? '' : ', ' + duration() }}
            </span>
          </div>

          @if (event().meetingLink && active()) {
            <a class="btn primary join" [href]="event().meetingLink" target="_blank" rel="noopener noreferrer">Join meeting</a>
          } @else if (event().meetingLink) {
            <p><a [href]="event().meetingLink" target="_blank" rel="noopener noreferrer">Meeting link</a></p>
          }
          @if (event().location) { <p><span class="muted">Location</span> {{ event().location }}</p> }
          @if (event().channel) { <p><span class="muted">Contact by</span> {{ event().channel }}</p> }

          @if (error()) { <p class="banner err" role="alert">{{ error() }}</p> }

          <div class="detail-actions left">
            @if (active()) {
              <button type="button" class="btn primary" (click)="complete()">Mark completed</button>
              <button type="button" class="btn" (click)="toggleReschedule()">{{ rescheduling() ? 'Never mind' : 'Reschedule' }}</button>
              <button type="button" class="btn" (click)="setStatus('Cancelled')">Cancel event</button>
            } @else {
              <button type="button" class="btn" (click)="setStatus('Scheduled')">Reopen</button>
            }
          </div>

          @if (rescheduling()) {
            <form [formGroup]="reschedule" (ngSubmit)="confirmReschedule()" class="reschedule" novalidate>
              <div class="grid two">
                <label class="field"><span>New date</span><input type="date" formControlName="date" /></label>
                <label class="field"><span>New time</span><input type="time" formControlName="time" /></label>
              </div>
              <label class="field">
                <span>Time zone</span>
                <input formControlName="timeZone" list="tz-options-detail" autocomplete="off" />
                <datalist id="tz-options-detail">
                  @for (z of zones; track z) { <option [value]="z"></option> }
                </datalist>
              </label>
              <label class="field">
                <span>Note</span>
                <input formControlName="note" placeholder="Optional, for example: they asked to move it" maxlength="500" />
              </label>
              @if (reschedule.invalid && reschedule.touched) { <small class="err">Choose a date, a time and a valid time zone.</small> }
              <button type="submit" class="btn primary" [disabled]="saving()">Confirm new time</button>
            </form>
          }
        </section>

        @if (event().interviewers.length) {
          <section class="panel">
            <h3>{{ followUp() || event().type === 'Recruiter Call' ? 'Contact' : 'Interviewers' }}</h3>
            <ul class="people">
              @for (p of event().interviewers; track $index) {
                <li>
                  <strong>{{ p.name }}</strong>
                  @if (p.role) { <span class="muted">{{ p.role }}</span> }
                  <span class="people-links">
                    @if (p.email) { <a [href]="'mailto:' + p.email">{{ p.email }}</a> }
                    @if (p.phone) { <a [href]="'tel:' + p.phone">{{ p.phone }}</a> }
                  </span>
                </li>
              }
            </ul>
          </section>
        }

        @if (event().prepNotes) {
          <section class="panel">
            <h3>{{ followUp() ? 'Notes' : 'Preparation notes' }}</h3>
            <p class="desc">{{ event().prepNotes }}</p>
          </section>
        }

        <section class="panel">
          <h3>Reminders</h3>
          @if (event().reminders.length) {
            <ul class="reminder-list">
              @for (r of reminders(); track r._id) {
                <li>
                  <span>{{ reminderText(r.minutesBefore) }}</span>
                  <span class="muted small-text">{{ r.dismissedAt ? 'Dismissed' : 'Waiting' }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="muted">No reminders. Use Edit to add some.</p>
          }
        </section>

        @if (event().rescheduledFrom.length) {
          <section class="panel">
            <h3>Reschedule history</h3>
            <ul class="reminder-list">
              @for (h of event().rescheduledFrom; track $index) {
                <li>
                  <span>Was {{ clock(h.startsAt, h.timeZone || event().timeZone) }}, {{ h.startsAt | date: 'd MMM y' }}</span>
                  <span class="muted small-text">changed {{ h.changedAt | date: 'd MMM' }}{{ h.note ? ': ' + h.note : '' }}</span>
                </li>
              }
            </ul>
          </section>
        }

        <footer class="detail-actions">
          <button type="button" class="btn" (click)="edit()">Edit</button>
          <button type="button" class="btn danger" (click)="remove()">Delete</button>
        </footer>
      </div>
    </aside>
  `
})
export class EventDetailComponent {
  readonly store = inject(ScheduleStore);
  private readonly fb = inject(FormBuilder);

  readonly event = input.required<JobEvent>();
  readonly zones = allTimeZones();

  readonly rescheduling = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly label = computed(() => eventLabel(this.event()));
  readonly color = computed(() => EVENT_COLORS[this.event().type]);
  readonly active = computed(() => isActive(this.event()));
  readonly followUp = computed(() => isFollowUpType(this.event().type));
  readonly when = computed(() => describeWhen(this.event().startsAt, this.event().timeZone));
  readonly relative = computed(() => relativeTime(this.event().startsAt, this.store.now()));
  readonly duration = computed(() => formatDuration(this.event().durationMinutes));
  readonly overdue = computed(() => this.active() && new Date(this.event().startsAt).getTime() < this.store.now());
  readonly reminders = computed(() => [...this.event().reminders].sort((a, b) => b.minutesBefore - a.minutesBefore));

  readonly reschedule = this.fb.nonNullable.group({
    date: ['', Validators.required],
    time: ['', Validators.required],
    timeZone: ['', Validators.required],
    note: ['']
  });

  reminderText(minutes: number): string {
    return reminderLabel(minutes);
  }

  clock(iso: string, zone: string): string {
    return clockInZone(iso, zone);
  }

  complete(): void {
    this.setStatus('Completed', true);
  }

  setStatus(status: 'Scheduled' | 'Completed' | 'Cancelled', updateJobStatus = false): void {
    this.error.set('');
    this.store.setStatus(this.event()._id, status, updateJobStatus).subscribe({
      error: () => this.error.set('Could not update the event. Try again.')
    });
  }

  toggleReschedule(): void {
    if (!this.rescheduling()) {
      const e = this.event();
      this.reschedule.reset({ ...utcToZoned(e.startsAt, e.timeZone), timeZone: e.timeZone, note: '' });
    }
    this.rescheduling.update((v) => !v);
  }

  confirmReschedule(): void {
    const v = this.reschedule.getRawValue();
    if (this.reschedule.invalid || !isValidTimeZone(v.timeZone)) {
      this.reschedule.markAllAsTouched();
      this.error.set('Choose a date, a time and a valid time zone.');
      return;
    }
    this.error.set('');
    this.saving.set(true);
    const startsAt = zonedToUtc(v.date, v.time, v.timeZone).toISOString();
    this.store.reschedule(this.event()._id, startsAt, v.timeZone, v.note.trim()).subscribe({
      next: () => {
        this.saving.set(false);
        this.rescheduling.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(err.error?.message ?? 'Could not reschedule. Try again.');
      }
    });
  }

  edit(): void {
    const e = this.event();
    this.store.closeDetail();
    this.store.openForm({ event: e });
  }

  remove(): void {
    const e = this.event();
    if (!confirm(`Delete "${this.label()}" with ${e.job.company}? This cannot be undone.`)) return;
    this.store.remove(e._id).subscribe({
      next: () => this.store.closeDetail(),
      error: () => this.error.set('Could not delete the event. Try again.')
    });
  }
}
