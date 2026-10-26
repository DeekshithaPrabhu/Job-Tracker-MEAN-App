import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, debounceTime, switchMap, tap } from 'rxjs';
import { Analytics, AnalyticsEvent, NextAction, RecentItem, SeriesPoint, SeriesRange } from './analytics.model';
import { AnalyticsService } from './analytics.service';
import { EVENT_COLORS, eventLabel } from './event.model';
import { STATUS_COLORS } from './job.model';
import { ScheduleStore } from './schedule.store';
import { relativeTime } from './time.util';

// Chart geometry (SVG user units; the chart scales to the panel width).
const W = 640;
const H = 250;
const PAD = { l: 34, r: 8, t: 10, b: 28 };

const SERIES = [
  { key: 'saved', label: 'Saved', color: STATUS_COLORS['Saved / Interested'] },
  { key: 'applied', label: 'Applied', color: STATUS_COLORS.Applied },
  { key: 'interviews', label: 'Interviews', color: STATUS_COLORS['Interview Scheduled'] }
] as const;

const PRIORITY_COLORS: Record<number, string> = { 1: '#ff3b30', 2: '#ff9500', 3: '#007aff' };

/** A round axis maximum with at most five gridlines. */
function niceScale(max: number): { top: number; step: number } {
  if (max <= 4) return { top: Math.max(max, 1), step: 1 };
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough) as number;
  return { top: Math.ceil(max / step) * step, step };
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
const utcDate = (start: string) => new Date(`${start}T00:00:00Z`);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe, NgTemplateOutlet],
  template: `
    <section class="hero">
      <h1>Dashboard</h1>
      <p class="sub">{{ summary() }}</p>
    </section>

    <main class="page dash" aria-live="polite">
      @if (error()) {
        <p class="banner err" role="alert">{{ error() }} <button type="button" class="btn small" (click)="retry()">Try again</button></p>
      }

      @if (data(); as d) {
        @if (!d.totals.saved) {
          <div class="empty">
            <strong>Nothing to show yet</strong>
            <p>Save your first job to see your progress, interviews and next steps here.</p>
            <button type="button" class="btn primary" (click)="saveJob.emit()">Save a job</button>
          </div>
        } @else {
          <section class="kpis" aria-label="Summary">
            @for (k of kpis(); track k.label) {
              <article class="kpi" [class.alert]="k.alert" [style.--c]="k.color">
                <span class="kpi-label">{{ k.label }}</span>
                <strong class="kpi-value">{{ k.value }}</strong>
                <span class="kpi-sub">{{ k.sub }}</span>
              </article>
            }
          </section>

          <div class="dash-grid wide">
            <section class="panel" aria-label="Progress over time">
              <div class="panel-head">
                <h3>Progress over time</h3>
                <div class="segmented" role="group" aria-label="Chart range">
                  <button type="button" [class.on]="range() === 'weeks'" [attr.aria-pressed]="range() === 'weeks'" (click)="range.set('weeks')">Weeks</button>
                  <button type="button" [class.on]="range() === 'months'" [attr.aria-pressed]="range() === 'months'" (click)="range.set('months')">Months</button>
                </div>
              </div>

              <ul class="legend">
                @for (s of legend(); track s.key) {
                  <li><span class="sw" [style.background]="s.color"></span>{{ s.label }}<strong>{{ s.total }}</strong></li>
                }
              </ul>

              @if (chart(); as c) {
                @if (c.empty) {
                  <p class="muted chart-empty">Nothing in the last {{ range() === 'weeks' ? '12 weeks' : '6 months' }} yet.</p>
                } @else {
                  <svg class="chart" [attr.viewBox]="'0 0 ' + c.width + ' ' + c.height" role="img" [attr.aria-label]="chartLabel()">
                    @for (t of c.ticks; track t.value) {
                      <line class="ch-grid" [attr.x1]="c.left" [attr.x2]="c.right" [attr.y1]="t.y" [attr.y2]="t.y" />
                      <text class="ch-axis" [attr.x]="c.left - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.value }}</text>
                    }
                    @for (g of c.groups; track g.start) {
                      <g>
                        <title>{{ g.title }}</title>
                        @for (b of g.bars; track b.name) {
                          @if (b.h > 0) {
                            <rect class="ch-bar" [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" [attr.rx]="b.rx" [attr.fill]="b.color" />
                          }
                        }
                        @if (g.showLabel) {
                          <text class="ch-axis" [attr.x]="g.cx" [attr.y]="c.height - 8" text-anchor="middle">{{ g.label }}</text>
                        }
                      </g>
                    }
                  </svg>
                  <ul class="sr-only">
                    @for (g of c.groups; track g.start) { <li>{{ g.title }}</li> }
                  </ul>
                }
              }
            </section>

            <section class="panel" aria-label="Applications by status">
              <div class="panel-head">
                <h3>Applications by status</h3>
                <button type="button" class="btn small ghost" (click)="goto.emit('applications')">Open board</button>
              </div>
              <ul class="status-bars">
                @for (r of statusRows(); track r.status) {
                  <li [style.--c]="r.color">
                    <span class="sb-name">{{ r.status }}</span>
                    <span class="sb-track"><span class="sb-fill" [style.width.%]="r.width"></span></span>
                    <strong class="sb-count">{{ r.count }}</strong>
                  </li>
                }
              </ul>
              <ol class="funnel" aria-label="Conversion through the pipeline">
                @for (f of funnelSteps(); track f.key) {
                  <li>
                    <strong>{{ f.count }}</strong>
                    <span class="muted small-text">{{ f.label }}</span>
                    <span class="rate small-text">{{ f.rate === null ? '' : f.rate + '%' }}</span>
                  </li>
                }
              </ol>
            </section>
          </div>

          <div class="dash-grid">
            <section class="panel" aria-label="Where to focus">
              <h3>Where to focus</h3>
              @if (d.insights.length) {
                <ul class="insights">
                  @for (i of d.insights; track i.title) {
                    <li [attr.data-level]="i.level">
                      <span class="ins-dot" aria-hidden="true"></span>
                      <div>
                        <strong>{{ i.title }}</strong>
                        <p class="muted small-text">{{ i.detail }}</p>
                      </div>
                    </li>
                  }
                </ul>
              } @else {
                <p class="muted">Nothing needs attention right now.</p>
              }
            </section>

            <section class="panel" aria-label="Next actions">
              <div class="panel-head">
                <h3>Next actions</h3>
                @if (d.nextActionsTotal > d.nextActions.length) {
                  <span class="muted small-text">Showing {{ d.nextActions.length }} of {{ d.nextActionsTotal }}</span>
                }
              </div>
              @if (d.nextActions.length) {
                <ul class="rows">
                  @for (a of d.nextActions; track $index) {
                    <li>
                      <button type="button" class="row-btn" [style.--c]="actionColor(a)" (click)="openAction(a)">
                        <span class="row-dot" aria-hidden="true"></span>
                        <span class="row-main">
                          <strong>{{ a.text }}</strong>
                          <span class="muted small-text">{{ a.detail }}</span>
                        </span>
                      </button>
                    </li>
                  }
                </ul>
              } @else {
                <p class="muted">You are all caught up.</p>
              }
            </section>

            <section class="panel" aria-label="Interviews and follow-ups">
              <div class="panel-head">
                <h3>Interviews and follow-ups</h3>
                <button type="button" class="btn small ghost" (click)="goto.emit('schedule')">Open schedule</button>
              </div>
              @if (d.overdue.length) {
                <h4 class="late">Overdue</h4>
                <ul class="rows">
                  @for (e of d.overdue; track e._id) { <li><ng-container *ngTemplateOutlet="eventRow; context: { $implicit: e }"></ng-container></li> }
                </ul>
              }
              @if (d.upcoming.length) {
                <h4>Coming up</h4>
                <ul class="rows">
                  @for (e of d.upcoming; track e._id) { <li><ng-container *ngTemplateOutlet="eventRow; context: { $implicit: e }"></ng-container></li> }
                </ul>
              } @else if (!d.overdue.length) {
                <p class="muted">Nothing scheduled. Add an interview or follow-up on the Schedule page.</p>
              }
            </section>

            <section class="panel" aria-label="Recent activity">
              <h3>Recent activity</h3>
              @if (d.recent.length) {
                <ul class="rows">
                  @for (r of d.recent; track $index) {
                    <li>
                      <button type="button" class="row-btn" [style.--c]="recentColor(r)" (click)="openRecent(r)">
                        <span class="row-dot" aria-hidden="true"></span>
                        <span class="row-main">
                          <strong>{{ r.text }}</strong>
                          @if (r.detail) { <span class="muted small-text">{{ r.detail }}</span> }
                        </span>
                        <span class="row-when muted small-text">{{ ago(r.at) }}</span>
                      </button>
                    </li>
                  }
                </ul>
              } @else {
                <p class="muted">Changes to your jobs will show up here.</p>
              }
            </section>
          </div>
        }
      } @else if (loading()) {
        <div class="empty"><strong>Loading your dashboard</strong></div>
      }
    </main>

    <ng-template #eventRow let-e>
      <button type="button" class="row-btn" [style.--c]="eventColor(e)" (click)="openEvent(e._id, e.job._id)">
        <span class="row-dot" aria-hidden="true"></span>
        <span class="row-main">
          <strong>{{ eventName(e) }}</strong>
          <span class="muted small-text">{{ e.job.company }}, {{ e.job.title }}</span>
        </span>
        <span class="row-when small-text" [class.late]="e.overdueKind">
          {{ e.startsAt | date: 'EEE d MMM, h:mm a' }}
          <span class="muted">{{ rel(e) }}</span>
        </span>
      </button>
    </ng-template>
  `
})
export class DashboardComponent {
  private readonly api = inject(AnalyticsService);
  private readonly store = inject(ScheduleStore);
  private readonly destroyRef = inject(DestroyRef);

  /** Changing this value reloads the numbers (the app bumps it whenever jobs change). */
  readonly refreshKey = input(0);
  readonly openJob = output<{ id: string; archived: boolean }>();
  readonly goto = output<'applications' | 'schedule'>();
  readonly saveJob = output<void>();

  readonly data = signal<Analytics | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly range = signal<SeriesRange>('weeks');

  private readonly reload$ = new Subject<void>();

  readonly summary = computed(() => {
    const d = this.data();
    if (!d) return this.error() ? 'The dashboard could not be loaded.' : 'Loading your job search.';
    const t = d.totals;
    if (!t.saved) return 'Save your first job to start seeing progress here.';
    const late = t.overdueFollowUps + t.needsUpdate;
    const status = late
      ? `${plural(late, 'item')} ${late === 1 ? 'needs' : 'need'} your attention.`
      : 'You are all caught up.';
    return `${plural(t.saved, 'job')} saved, ${t.applied} applied. ${status}`;
  });

  readonly kpis = computed(() => {
    const t = this.data()?.totals;
    if (!t) return [];
    const next = t.nextInterview;
    return [
      { label: 'Saved jobs', value: t.saved, sub: `${t.active} active, ${t.archived} archived`, color: STATUS_COLORS['Saved / Interested'], alert: false },
      { label: 'Applications submitted', value: t.applied, sub: `${t.appliedLast7} in the last 7 days`, color: STATUS_COLORS.Applied, alert: false },
      {
        label: 'Upcoming interviews', value: t.upcomingInterviews, color: STATUS_COLORS['Interview Scheduled'], alert: false,
        sub: next ? `Next: ${next.job.company}, ${this.rel(next)}` : 'None scheduled'
      },
      {
        label: 'Overdue follow-ups', value: t.overdueFollowUps, color: STATUS_COLORS.Rejected, alert: t.overdueFollowUps > 0,
        sub: t.needsUpdate ? `${plural(t.needsUpdate, 'past event')} to update` : t.overdueFollowUps ? 'Send them today' : 'Nothing late'
      },
      {
        label: 'Offers received', value: t.offersReceived, color: STATUS_COLORS['Offer Received'], alert: false,
        sub: t.offersOpen ? `${t.offersOpen} still open` : 'None open'
      },
      {
        label: 'Rejections', value: t.rejections, color: '#8e8e93', alert: false,
        sub: t.applied ? `${Math.min(100, Math.round((t.rejections / t.applied) * 100))}% of applications` : 'None yet'
      }
    ];
  });

  readonly legend = computed(() => {
    const points = this.data()?.series[this.range()] ?? [];
    return SERIES.map((s) => ({ ...s, total: points.reduce((sum, p) => sum + p[s.key], 0) }));
  });

  readonly chart = computed(() => {
    const d = this.data();
    if (!d) return null;
    const range = this.range();
    const points = d.series[range];
    const max = Math.max(0, ...points.map((p) => Math.max(p.saved, p.applied, p.interviews)));
    const { top, step } = niceScale(max);
    const plotW = W - PAD.l - PAD.r;
    const plotH = H - PAD.t - PAD.b;
    const groupW = plotW / points.length;
    const barW = Math.min(16, groupW * 0.24);
    const gap = Math.min(3, barW * 0.2);
    const clusterW = barW * SERIES.length + gap * (SERIES.length - 1);
    const y = (v: number) => PAD.t + plotH - (v / top) * plotH;

    const ticks: { value: number; y: number }[] = [];
    for (let v = 0; v <= top; v += step) ticks.push({ value: v, y: y(v) });

    const groups = points.map((p, i) => {
      const x0 = PAD.l + i * groupW + (groupW - clusterW) / 2;
      const bars = SERIES.map((s, j) => {
        const value = p[s.key];
        const h = (value / top) * plotH;
        return { name: s.label, color: s.color, value, x: x0 + j * (barW + gap), y: PAD.t + plotH - h, w: barW, h, rx: Math.min(3, h / 2) };
      });
      return {
        start: p.start,
        cx: PAD.l + i * groupW + groupW / 2,
        label: this.shortLabel(p, range),
        showLabel: points.length <= 8 || (points.length - 1 - i) % 2 === 0,
        title: this.pointTitle(p, range),
        bars
      };
    });
    return { width: W, height: H, left: PAD.l, right: W - PAD.r, ticks, groups, empty: max === 0 };
  });

  readonly chartLabel = computed(
    () => `Saved, applied and interview counts for the last ${this.range() === 'weeks' ? '12 weeks' : '6 months'}`
  );

  readonly statusRows = computed(() => {
    const rows = this.data()?.byStatus ?? [];
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, color: STATUS_COLORS[r.status], width: (r.count / max) * 100 }));
  });

  readonly funnelSteps = computed(() => {
    const d = this.data();
    if (!d) return [];
    const rates = [null, d.rates.applied, d.rates.interview, d.rates.offer];
    return d.funnel.map((f, i) => ({ ...f, rate: rates[i] }));
  });

  constructor() {
    this.reload$
      .pipe(
        debounceTime(150),
        tap(() => this.loading.set(true)),
        switchMap(() =>
          this.api.load().pipe(
            catchError(() => {
              this.error.set('Could not load your dashboard.');
              this.loading.set(false);
              return EMPTY;
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((analytics) => {
        this.data.set(analytics);
        this.error.set('');
        this.loading.set(false);
      });

    // Load on first show, whenever the app reports a job change, and when events change.
    effect(() => {
      this.refreshKey();
      this.reload$.next();
    });
    this.store.changed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.reload$.next());
  }

  retry(): void {
    this.reload$.next();
  }

  // --- Labels and colors ---

  eventName(e: AnalyticsEvent): string {
    return eventLabel(e);
  }

  eventColor(e: AnalyticsEvent): string {
    return e.overdueKind ? PRIORITY_COLORS[1] : EVENT_COLORS[e.type];
  }

  rel(e: AnalyticsEvent): string {
    return relativeTime(e.startsAt, this.store.now());
  }

  ago(iso: string): string {
    return relativeTime(iso, this.store.now());
  }

  actionColor(a: NextAction): string {
    return PRIORITY_COLORS[a.priority] ?? '#8e8e93';
  }

  recentColor(r: RecentItem): string {
    if (r.status) return STATUS_COLORS[r.status];
    if (r.eventType) return EVENT_COLORS[r.eventType];
    return '#8e8e93';
  }

  private shortLabel(p: SeriesPoint, range: SeriesRange): string {
    const date = utcDate(p.start);
    return range === 'weeks'
      ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date)
      : new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' }).format(date);
  }

  private pointTitle(p: SeriesPoint, range: SeriesRange): string {
    const date = utcDate(p.start);
    const when =
      range === 'weeks'
        ? `Week of ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)}`
        : new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
    return `${when}: ${p.saved} saved, ${p.applied} applied, ${plural(p.interviews, 'interview')}`;
  }

  // --- Navigation ---

  openAction(a: NextAction): void {
    if (a.eventId) this.openEvent(a.eventId, a.jobId);
    else this.openJob.emit({ id: a.jobId, archived: false });
  }

  openRecent(r: RecentItem): void {
    if (r.eventId) this.openEvent(r.eventId, r.jobId, r.archived);
    else this.openJob.emit({ id: r.jobId, archived: r.archived });
  }

  openEvent(eventId: string, jobId: string, archived = false): void {
    // The event sheet reads from the schedule store; fall back to the job if the event is not loaded yet.
    if (this.store.events().some((e) => e._id === eventId)) this.store.openDetail(eventId);
    else this.openJob.emit({ id: jobId, archived });
  }
}
