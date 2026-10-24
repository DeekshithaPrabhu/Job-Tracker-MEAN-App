import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subject, tap } from 'rxjs';
import { DueReminder, EventInput, EventStatus, JobEvent } from './event.model';

export interface FormRequest {
  event?: JobEvent | null;
  jobId?: string | null;
  date?: string | null;
}

type NotifyState = NotificationPermission | 'unsupported';

/** Shared state for interviews and follow-ups, used by the schedule page, job sheet, dialogs and reminders. */
@Injectable({ providedIn: 'root' })
export class ScheduleStore {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/events';

  readonly events = signal<JobEvent[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  /** Updated every 30 seconds so "in 55 minutes" and overdue markers stay current. */
  readonly now = signal(Date.now());

  /** Fires when events change, so reminders are re-checked straight away. */
  readonly changed$ = new Subject<void>();
  /** Fires when scheduling an event moved a job along the pipeline. */
  readonly jobsChanged$ = new Subject<void>();

  readonly detailId = signal<string | null>(null);
  readonly detail = computed(() => this.events().find((e) => e._id === this.detailId()) ?? null);
  readonly form = signal<{ open: boolean; event: JobEvent | null; jobId: string | null; date: string | null }>({
    open: false, event: null, jobId: null, date: null
  });

  readonly notifyPermission = signal<NotifyState>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );

  constructor() {
    setInterval(() => this.now.set(Date.now()), 30000);
  }

  // --- Loading ---

  load(): void {
    this.loading.set(true);
    this.http.get<JobEvent[]>(this.base).subscribe({
      next: (events) => {
        this.events.set(events.filter((e) => e.job));
        this.error.set('');
        this.loading.set(false);
        this.changed$.next();
      },
      error: () => {
        this.error.set('Could not load your schedule. Check that the API is running on port 3000.');
        this.loading.set(false);
      }
    });
  }

  eventsForJob(jobId: string): JobEvent[] {
    return this.events().filter((e) => e.job._id === jobId);
  }

  // --- Dialogs ---

  openDetail(id: string): void {
    this.detailId.set(id);
  }

  closeDetail(): void {
    this.detailId.set(null);
  }

  openForm(request: FormRequest = {}): void {
    this.form.set({ open: true, event: request.event ?? null, jobId: request.jobId ?? null, date: request.date ?? null });
  }

  closeForm(): void {
    this.form.set({ open: false, event: null, jobId: null, date: null });
  }

  // --- Changes ---

  create(input: EventInput): Observable<JobEvent> {
    return this.http.post<JobEvent>(this.base, input).pipe(tap((e) => this.afterChange(e)));
  }

  update(id: string, input: EventInput): Observable<JobEvent> {
    return this.http.put<JobEvent>(`${this.base}/${id}`, input).pipe(tap((e) => this.afterChange(e)));
  }

  setStatus(id: string, status: EventStatus, updateJobStatus = false): Observable<JobEvent> {
    return this.http
      .patch<JobEvent>(`${this.base}/${id}/status`, { status, updateJobStatus })
      .pipe(tap((e) => this.afterChange(e)));
  }

  reschedule(id: string, startsAt: string, timeZone: string, note: string): Observable<JobEvent> {
    return this.http
      .post<JobEvent>(`${this.base}/${id}/reschedule`, { startsAt, timeZone, note })
      .pipe(tap((e) => this.afterChange(e)));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(tap(() => this.afterChange()));
  }

  /** Quick action used by rows: mark done and let the job advance when it makes sense. */
  complete(event: JobEvent): void {
    this.setStatus(event._id, 'Completed', true).subscribe({
      error: () => this.error.set(`Could not mark "${event.job.company}" as completed. Try again.`)
    });
  }

  private afterChange(event?: JobEvent): void {
    this.load();
    if (event?.jobStatusChanged) this.jobsChanged$.next();
  }

  // --- Reminders ---

  dueReminders(): Observable<DueReminder[]> {
    return this.http.get<DueReminder[]>(`${this.base}/reminders/due`);
  }

  dismissReminder(eventId: string, reminderId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/${eventId}/reminders/${reminderId}/dismiss`, {});
  }

  enableNotifications(): void {
    if (typeof Notification === 'undefined') return;
    Notification.requestPermission().then((p) => this.notifyPermission.set(p));
  }
}
