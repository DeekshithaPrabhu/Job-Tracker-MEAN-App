import { DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { EVENT_COLORS, JobEvent, eventLabel, isActive } from './event.model';
import { ScheduleStore } from './schedule.store';
import { clockInZone, formatDuration, localTimeZone } from './time.util';

@Component({
  selector: 'app-event-row',
  standalone: true,
  imports: [DatePipe],
  template: `
    <article class="ev-row" [class.closed]="!active()" [class.overdue]="overdue()" [style.--c]="color()"
             tabindex="0" role="button" [attr.aria-label]="label() + ' with ' + event().job.company"
             (click)="store.openDetail(event()._id)" (keydown.enter)="store.openDetail(event()._id)">
      <div class="ev-time">
        @if (showDate()) { <span class="ev-date">{{ event().startsAt | date: 'd MMM' }}</span> }
        <strong>{{ event().startsAt | date: 'h:mm a' }}</strong>
        <span class="muted small-text">{{ duration() }}</span>
      </div>
      <span class="ev-bar" aria-hidden="true"></span>
      <div class="ev-main">
        <strong class="ev-title">{{ label() }}</strong>
        <span class="muted">{{ event().job.company }}, {{ event().job.title }}</span>
        <div class="ev-meta">
          @if (event().status !== 'Scheduled') {
            <span class="badge" [attr.data-status]="event().status">{{ event().status }}</span>
          }
          @if (overdue()) { <span class="badge" data-status="Overdue">Needs an update</span> }
          @if (zoneNote()) { <span class="muted small-text">{{ zoneNote() }}</span> }
          @if (event().meetingLink) { <span class="muted small-text">Has meeting link</span> }
        </div>
      </div>
      @if (active()) {
        <button type="button" class="btn small" (click)="done($event)" [attr.aria-label]="'Mark ' + label() + ' completed'">
          Mark done
        </button>
      }
    </article>
  `
})
export class EventRowComponent {
  readonly store = inject(ScheduleStore);
  readonly event = input.required<JobEvent>();
  readonly showDate = input(false);

  readonly label = computed(() => eventLabel(this.event()));
  readonly color = computed(() => EVENT_COLORS[this.event().type]);
  readonly active = computed(() => isActive(this.event()));
  readonly overdue = computed(() => this.active() && new Date(this.event().startsAt).getTime() < this.store.now());
  readonly duration = computed(() => (this.event().type === 'Follow-up' || this.event().type === 'Check-in' ? 'Due' : formatDuration(this.event().durationMinutes)));
  readonly zoneNote = computed(() => {
    const e = this.event();
    return e.timeZone && e.timeZone !== localTimeZone() ? `${clockInZone(e.startsAt, e.timeZone)} for them` : '';
  });

  done(ev: Event): void {
    ev.stopPropagation();
    this.store.complete(this.event());
  }
}
