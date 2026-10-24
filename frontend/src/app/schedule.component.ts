import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { EVENT_COLORS, EVENT_TYPES, JobEvent, eventLabel, isActive } from './event.model';
import { EventRowComponent } from './event-row.component';
import { ScheduleStore } from './schedule.store';
import { dateKey, dayLabel, keyToDate } from './time.util';

type Tab = 'upcoming' | 'calendar' | 'past';

interface Cell {
  key: string;
  day: number;
  inMonth: boolean;
  today: boolean;
  events: JobEvent[];
}

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [DatePipe, EventRowComponent],
  template: `
    <section class="hero">
      <h1>Schedule</h1>
      <p class="sub">{{ summary() }}</p>
    </section>

    <section class="toolbar" aria-label="Schedule options">
      <div class="segmented" role="group" aria-label="Schedule view">
        <button type="button" [class.on]="tab() === 'upcoming'" [attr.aria-pressed]="tab() === 'upcoming'" (click)="tab.set('upcoming')">
          Upcoming<span class="count">{{ upcomingCount() }}</span>
        </button>
        <button type="button" [class.on]="tab() === 'calendar'" [attr.aria-pressed]="tab() === 'calendar'" (click)="tab.set('calendar')">Calendar</button>
        <button type="button" [class.on]="tab() === 'past'" [attr.aria-pressed]="tab() === 'past'" (click)="tab.set('past')">Past</button>
      </div>

      <select class="pill-select" aria-label="Event type" (change)="typeFilter.set($any($event.target).value)">
        <option value="">All event types</option>
        @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
      </select>

      @if (store.notifyPermission() === 'default') {
        <button type="button" class="btn small push-right" (click)="store.enableNotifications()">Turn on desktop alerts</button>
      } @else if (store.notifyPermission() === 'denied') {
        <span class="muted small-text push-right">Desktop alerts are blocked in your browser settings.</span>
      }
    </section>

    <main class="page" aria-live="polite">
      @if (store.error()) { <p class="banner err" role="alert">{{ store.error() }}</p> }

      @switch (tab()) {
        @case ('upcoming') {
          @if (overdue().length) {
            <section class="day-group">
              <h2 class="day-title warn">Needs an update</h2>
              <p class="muted small-text group-hint">These have passed. Mark them completed, reschedule, or cancel.</p>
              <div class="ev-list">
                @for (e of overdue(); track e._id) { <app-event-row [event]="e" [showDate]="true" /> }
              </div>
            </section>
          }

          @for (g of upcomingGroups(); track g.key) {
            <section class="day-group">
              <h2 class="day-title">{{ g.label }}<span class="muted small-text">{{ g.date | date: 'd MMM y' }}</span></h2>
              <div class="ev-list">
                @for (e of g.events; track e._id) { <app-event-row [event]="e" /> }
              </div>
            </section>
          }

          @if (!overdue().length && !upcomingGroups().length) {
            <div class="empty">
              <strong>{{ store.loading() ? 'Loading your schedule' : 'Nothing scheduled' }}</strong>
              @if (!store.loading()) {
                <p>Add an interview, recruiter call, or follow-up to see it here.</p>
                <button type="button" class="btn primary" (click)="store.openForm()">Schedule an event</button>
              }
            </div>
          }
        }

        @case ('calendar') {
          <div class="cal">
            <div class="cal-head">
              <h2>{{ monthLabel() }}</h2>
              <div class="cal-nav">
                <button type="button" class="btn small" (click)="shift(-1)" aria-label="Previous month">&#8249;</button>
                <button type="button" class="btn small" (click)="today()">Today</button>
                <button type="button" class="btn small" (click)="shift(1)" aria-label="Next month">&#8250;</button>
              </div>
            </div>

            <div class="cal-grid" role="grid" [attr.aria-label]="monthLabel()">
              @for (d of weekdays; track d) { <div class="cal-dow" role="columnheader">{{ d }}</div> }
              @for (c of cells(); track c.key) {
                <div class="cal-cell" role="gridcell" tabindex="0"
                     [class.dim]="!c.inMonth" [class.today]="c.today" [class.sel]="c.key === selectedKey()"
                     (click)="selectedKey.set(c.key)" (keydown.enter)="selectedKey.set(c.key)">
                  <span class="cal-num">{{ c.day }}</span>
                  @for (e of c.events.slice(0, 3); track e._id) {
                    <button type="button" class="cal-chip" [class.done]="!isActive(e)" [style.--c]="color(e)"
                            [attr.title]="label(e) + ' with ' + e.job.company"
                            (click)="open(e, $event)">
                      {{ e.startsAt | date: 'h:mm a' }} {{ e.job.company }}
                    </button>
                  }
                  @if (c.events.length > 3) { <span class="cal-more">+{{ c.events.length - 3 }} more</span> }
                </div>
              }
            </div>

            <section class="day-panel">
              <div class="day-panel-head">
                <h2>{{ selectedLabel() }}</h2>
                <button type="button" class="btn small" (click)="store.openForm({ date: selectedKey() })">Add event</button>
              </div>
              @if (selectedEvents().length) {
                <div class="ev-list">
                  @for (e of selectedEvents(); track e._id) { <app-event-row [event]="e" /> }
                </div>
              } @else {
                <p class="muted">Nothing on this day.</p>
              }
            </section>
          </div>
        }

        @case ('past') {
          @if (past().length) {
            <div class="ev-list">
              @for (e of past(); track e._id) { <app-event-row [event]="e" [showDate]="true" /> }
            </div>
          } @else {
            <div class="empty">
              <strong>No completed or cancelled events</strong>
              <p>Events you mark as completed or cancel will be listed here.</p>
            </div>
          }
        }
      }
    </main>
  `
})
export class ScheduleComponent {
  readonly store = inject(ScheduleStore);
  readonly types = EVENT_TYPES;
  readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly isActive = isActive;

  readonly tab = signal<Tab>('upcoming');
  readonly typeFilter = signal('');
  readonly month = signal(this.firstOfMonth(new Date()));
  readonly selectedKey = signal(dateKey(new Date()));

  /** Events after the type filter has been applied. */
  private readonly visible = computed(() => {
    const type = this.typeFilter();
    return this.store.events().filter((e) => !type || e.type === type);
  });

  private readonly byStart = (a: JobEvent, b: JobEvent) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();

  readonly overdue = computed(() =>
    this.visible().filter((e) => isActive(e) && new Date(e.startsAt).getTime() < this.store.now()).sort(this.byStart)
  );

  readonly upcomingGroups = computed(() => {
    const now = this.store.now();
    const upcoming = this.visible()
      .filter((e) => isActive(e) && new Date(e.startsAt).getTime() >= now)
      .sort(this.byStart);
    const groups = new Map<string, JobEvent[]>();
    for (const e of upcoming) {
      const key = dateKey(new Date(e.startsAt));
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return [...groups.entries()].map(([key, events]) => ({ key, label: dayLabel(key, now), date: keyToDate(key), events }));
  });

  readonly upcomingCount = computed(() => this.overdue().length + this.upcomingGroups().reduce((n, g) => n + g.events.length, 0));

  readonly past = computed(() =>
    this.visible().filter((e) => !isActive(e)).sort((a, b) => this.byStart(b, a))
  );

  readonly summary = computed(() => {
    const now = this.store.now();
    const todayKey = dateKey(new Date(now));
    const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
    const active = this.store.events().filter(isActive);
    const today = active.filter((e) => dateKey(new Date(e.startsAt)) === todayKey).length;
    const week = active.filter((e) => {
      const t = new Date(e.startsAt).getTime();
      return t >= now && t <= weekEnd;
    }).length;
    const late = active.filter((e) => new Date(e.startsAt).getTime() < now).length;
    const parts = [`${today} today`, `${week} in the next 7 days`];
    if (late) parts.push(`${late} to update`);
    return parts.join(', ');
  });

  // --- Calendar ---

  readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(this.month())
  );

  private readonly eventsByDay = computed(() => {
    const map = new Map<string, JobEvent[]>();
    for (const e of [...this.visible()].sort(this.byStart)) {
      const key = dateKey(new Date(e.startsAt));
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  });

  readonly cells = computed<Cell[]>(() => {
    const first = this.month();
    const offset = (first.getDay() + 6) % 7; // weeks start on Monday
    const todayKey = dateKey(new Date(this.store.now()));
    const byDay = this.eventsByDay();
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i);
      const key = dateKey(d);
      return { key, day: d.getDate(), inMonth: d.getMonth() === first.getMonth(), today: key === todayKey, events: byDay.get(key) ?? [] };
    });
  });

  readonly selectedEvents = computed(() => this.eventsByDay().get(this.selectedKey()) ?? []);
  readonly selectedLabel = computed(() => dayLabel(this.selectedKey(), this.store.now()));

  shift(by: number): void {
    const m = this.month();
    this.month.set(new Date(m.getFullYear(), m.getMonth() + by, 1));
  }

  today(): void {
    const now = new Date();
    this.month.set(this.firstOfMonth(now));
    this.selectedKey.set(dateKey(now));
  }

  open(e: JobEvent, ev: Event): void {
    ev.stopPropagation();
    this.store.openDetail(e._id);
  }

  color(e: JobEvent): string {
    return EVENT_COLORS[e.type];
  }

  label(e: JobEvent): string {
    return eventLabel(e);
  }

  private firstOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
}
