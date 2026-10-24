import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, merge, switchMap, timer } from 'rxjs';
import { DueReminder, EVENT_COLORS, eventLabel, isFollowUpType } from './event.model';
import { ScheduleStore } from './schedule.store';
import { relativeTime } from './time.util';

@Component({
  selector: 'app-reminders',
  standalone: true,
  template: `
    @if (due().length) {
      <div class="toasts" role="region" aria-label="Reminders" aria-live="polite">
        @for (r of due(); track r.eventId + r.reminderId) {
          <article class="toast" [style.--c]="color(r)">
            <div class="toast-text">
              <strong>{{ label(r) }}</strong>
              <span>{{ r.event.job.company }}, {{ r.event.job.title }}</span>
              <span class="muted small-text">{{ when(r) }}</span>
            </div>
            <div class="toast-actions">
              <button type="button" class="btn small primary" (click)="view(r)">View</button>
              <button type="button" class="btn small" (click)="dismiss(r)">Dismiss</button>
            </div>
          </article>
        }
      </div>
    }
  `
})
export class RemindersComponent {
  private readonly store = inject(ScheduleStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly due = signal<DueReminder[]>([]);
  private readonly notified = new Set<string>();

  constructor() {
    // Check every minute, and straight away whenever events change.
    merge(timer(0, 60000), this.store.changed$)
      .pipe(
        switchMap(() => this.store.dueReminders().pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((list) => {
        this.due.set(list);
        list.forEach((r) => this.notify(r));
      });
  }

  label(r: DueReminder): string {
    const name = eventLabel(r.event);
    return isFollowUpType(r.event.type) ? `${name} due` : name;
  }

  color(r: DueReminder): string {
    return EVENT_COLORS[r.event.type];
  }

  when(r: DueReminder): string {
    const text = relativeTime(r.event.startsAt, this.store.now());
    return text === 'now' ? 'Starting now' : text.endsWith('ago') ? `Started ${text}` : `Starts ${text}`;
  }

  view(r: DueReminder): void {
    this.store.openDetail(r.eventId);
  }

  dismiss(r: DueReminder): void {
    this.due.update((list) => list.filter((x) => x.reminderId !== r.reminderId));
    this.store.dismissReminder(r.eventId, r.reminderId).subscribe({ error: () => undefined });
  }

  private notify(r: DueReminder): void {
    const key = `${r.eventId}:${r.reminderId}`;
    if (this.notified.has(key) || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    this.notified.add(key);
    try {
      new Notification(this.label(r), { body: `${r.event.job.company}, ${this.when(r).toLowerCase()}`, tag: key });
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }
}
