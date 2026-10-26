import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl, FormArray, FormControl, FormGroup, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators
} from '@angular/forms';
import {
  CHANNELS, DEFAULT_REMINDERS, DURATIONS, EVENT_TYPES, EventInput, EventType, INTERVIEW_ROUNDS, Interviewer,
  REMINDER_PRESETS, isFollowUpType
} from './event.model';
import { Job } from './job.model';
import { JobService } from './job.service';
import { ScheduleStore } from './schedule.store';
import { allTimeZones, dateKey, describeWhen, isValidTimeZone, localTimeZone, utcToZoned, zonedToUtc } from './time.util';

type InterviewerGroup = FormGroup<{
  name: FormControl<string>;
  role: FormControl<string>;
  email: FormControl<string>;
  phone: FormControl<string>;
}>;

const timeZoneValidator = (c: AbstractControl): ValidationErrors | null =>
  c.value && isValidTimeZone(c.value) ? null : { timeZone: true };

const urlValidator = (c: AbstractControl): ValidationErrors | null => {
  if (!c.value) return null;
  try {
    const { protocol } = new URL(c.value);
    return protocol === 'http:' || protocol === 'https:' ? null : { url: true };
  } catch {
    return { url: true };
  }
};

const nameRequiredIfAny = (g: AbstractControl): ValidationErrors | null => {
  const v = g.getRawValue() as { name: string; role: string; email: string; phone: string };
  return !v.name.trim() && (v.role.trim() || v.email.trim() || v.phone.trim()) ? { nameRequired: true } : null;
};

@Component({
  selector: 'app-event-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="scrim" (click)="store.closeForm()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" [attr.aria-label]="editing ? 'Edit event' : 'Schedule an event'">
      <header class="drawer-head">
        <h2>{{ editing ? 'Edit event' : 'Schedule an event' }}</h2>
        <button type="button" class="btn ghost small" (click)="store.closeForm()">Close</button>
      </header>

      <form [formGroup]="form" (ngSubmit)="submit()" class="drawer-body" novalidate>
        <fieldset>
          <legend>What</legend>
          <label class="field">
            <span>Job</span>
            <select formControlName="job">
              <option value="" disabled>Choose a job</option>
              @for (j of jobs(); track j._id) {
                <option [value]="j._id">{{ j.company }}: {{ j.title }}{{ j.isArchived ? ' (archived)' : '' }}</option>
              }
            </select>
            @if (invalid('job')) { <small class="err">Choose the job this event belongs to.</small> }
            @if (serverErrors()['job']) { <small class="err">{{ serverErrors()['job'] }}</small> }
          </label>

          <div class="grid two">
            <label class="field">
              <span>Type</span>
              <select formControlName="type">
                @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
              </select>
            </label>
            @if (type() === 'Interview') {
              <label class="field">
                <span>Interview round</span>
                <select formControlName="round">
                  @for (r of rounds; track r) { <option [value]="r">{{ r }}</option> }
                </select>
              </label>
            } @else if (followUp()) {
              <label class="field">
                <span>Contact by</span>
                <select formControlName="channel">
                  @for (c of channels; track c) { <option [value]="c">{{ c }}</option> }
                </select>
              </label>
            }
          </div>

          <label class="field">
            <span>Title</span>
            <input formControlName="title" placeholder="Optional, for example: System design with Priya" />
          </label>
        </fieldset>

        <fieldset>
          <legend>{{ followUp() ? 'Due' : 'When' }}</legend>
          <div class="grid two">
            <label class="field">
              <span>{{ followUp() ? 'Due date' : 'Date' }}</span>
              <input formControlName="date" type="date" />
              @if (invalid('date')) { <small class="err">Choose a date.</small> }
            </label>
            <label class="field">
              <span>{{ followUp() ? 'Due time' : 'Time' }}</span>
              <input formControlName="time" type="time" />
              @if (invalid('time')) { <small class="err">Choose a time.</small> }
            </label>
          </div>
          <div class="grid two">
            <label class="field">
              <span>Time zone</span>
              <input formControlName="timeZone" list="tz-options" autocomplete="off" />
              <datalist id="tz-options">
                @for (z of zones; track z) { <option [value]="z"></option> }
              </datalist>
              @if (invalid('timeZone')) { <small class="err">Pick a time zone from the list, like Asia/Kolkata.</small> }
            </label>
            @if (!followUp()) {
              <label class="field">
                <span>Length</span>
                <select formControlName="durationMinutes">
                  @for (d of durations; track d) { <option [value]="d">{{ d }} minutes</option> }
                </select>
              </label>
            }
          </div>
          @if (preview(); as p) {
            <p class="hint">{{ p.local ? 'In your time zone: ' + p.local : p.event }}</p>
          }
          @if (editing) { <p class="hint">Changing the date or time marks this event as rescheduled and sets its reminders again.</p> }
          @if (serverErrors()['startsAt']) { <small class="err">{{ serverErrors()['startsAt'] }}</small> }
        </fieldset>

        @if (!followUp()) {
          <fieldset>
            <legend>Where</legend>
            <label class="field">
              <span>Meeting link</span>
              <input formControlName="meetingLink" type="url" placeholder="https://" />
              @if (invalid('meetingLink')) { <small class="err">Use a link that starts with http:// or https://</small> }
            </label>
            <label class="field">
              <span>Location</span>
              <input formControlName="location" placeholder="Office address or phone number, if not online" />
            </label>
          </fieldset>
        }

        <fieldset>
          <legend>{{ followUp() || type() === 'Recruiter Call' ? 'Contact' : 'Interviewers' }}</legend>
          @for (g of interviewers.controls; track g; let i = $index) {
            <div class="interviewer" [formGroup]="g">
              <div class="grid two">
                <label class="field">
                  <span>Name</span>
                  <input formControlName="name" autocomplete="off" />
                </label>
                <label class="field">
                  <span>Role</span>
                  <input formControlName="role" placeholder="Engineering manager" />
                </label>
              </div>
              <div class="grid two">
                <label class="field">
                  <span>Email</span>
                  <input formControlName="email" type="email" autocomplete="off" />
                </label>
                <label class="field">
                  <span>Phone</span>
                  <input formControlName="phone" type="tel" />
                </label>
              </div>
              @if (g.errors?.['nameRequired'] && g.touched) { <small class="err">Add a name for this person.</small> }
              @if (g.controls.email.invalid && g.controls.email.touched) { <small class="err">Enter a valid email address.</small> }
              <button type="button" class="btn ghost small danger" (click)="removeInterviewer(i)">Remove</button>
            </div>
          }
          <button type="button" class="btn small" (click)="addInterviewer()">
            {{ followUp() || type() === 'Recruiter Call' ? 'Add a contact' : 'Add an interviewer' }}
          </button>
        </fieldset>

        <fieldset>
          <legend>{{ followUp() ? 'Notes' : 'Preparation notes' }}</legend>
          <label class="field">
            <span class="sr-only">Notes</span>
            <textarea formControlName="prepNotes" rows="5"
                      [placeholder]="followUp() ? 'What do you want to say or ask?' : 'Topics to review, questions to ask, things to bring'"></textarea>
          </label>
        </fieldset>

        <fieldset>
          <legend>Reminders</legend>
          <div class="reminder-chips" role="group" aria-label="Reminders">
            @for (p of presets; track p.minutes) {
              <button type="button" class="chip-toggle" [class.on]="reminders().includes(p.minutes)"
                      [attr.aria-pressed]="reminders().includes(p.minutes)" (click)="toggleReminder(p.minutes)">
                {{ p.label }}
              </button>
            }
          </div>
          <p class="hint">Reminders appear in the app while it is open, and as desktop alerts if you turn them on in Schedule.</p>
        </fieldset>

        @if (advanceTo()) {
          <label class="check">
            <input type="checkbox" formControlName="updateJobStatus" />
            <span>Also move this job to {{ advanceTo() }}</span>
          </label>
        }

        @if (formError()) { <p class="banner err" role="alert">{{ formError() }}</p> }

        <footer class="drawer-foot">
          <button type="button" class="btn ghost" (click)="store.closeForm()">Cancel</button>
          <button type="submit" class="btn primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : editing ? 'Save changes' : 'Schedule' }}
          </button>
        </footer>
      </form>
    </aside>
  `
})
export class EventFormComponent implements OnInit {
  readonly store = inject(ScheduleStore);
  private readonly fb = inject(FormBuilder);
  private readonly jobsApi = inject(JobService);

  readonly editing = !!this.store.form().event;
  readonly types = EVENT_TYPES;
  readonly rounds = INTERVIEW_ROUNDS;
  readonly channels = CHANNELS;
  readonly durations = DURATIONS;
  readonly presets = REMINDER_PRESETS;
  readonly zones = allTimeZones();

  readonly jobs = signal<Job[]>([]);
  readonly reminders = signal<number[]>(DEFAULT_REMINDERS.Interview);
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly serverErrors = signal<Record<string, string>>({});
  private remindersTouched = false;

  readonly form = this.fb.nonNullable.group({
    job: ['', Validators.required],
    type: ['Interview' as EventType],
    round: ['Technical'],
    title: [''],
    date: [dateKey(new Date()), Validators.required],
    time: ['10:00', Validators.required],
    timeZone: [localTimeZone(), [Validators.required, timeZoneValidator]],
    durationMinutes: [60],
    meetingLink: ['', urlValidator],
    location: [''],
    channel: ['Email'],
    prepNotes: [''],
    updateJobStatus: [true]
  });
  readonly interviewers = new FormArray<InterviewerGroup>([]);

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly type = computed(() => this.values().type ?? 'Interview');
  readonly followUp = computed(() => isFollowUpType(this.type()));

  readonly preview = computed(() => {
    const v = this.values();
    if (!v.date || !v.time || !v.timeZone || !isValidTimeZone(v.timeZone)) return null;
    return describeWhen(zonedToUtc(v.date, v.time, v.timeZone).toISOString(), v.timeZone);
  });

  readonly advanceTo = computed(() => {
    if (this.editing) return '';
    const job = this.jobs().find((j) => j._id === this.values().job);
    if (!job) return '';
    if (this.type() === 'Interview' && ['Saved / Interested', 'Applied', 'Assessment'].includes(job.status)) return 'Interview Scheduled';
    if (this.type() === 'Assessment' && ['Saved / Interested', 'Applied'].includes(job.status)) return 'Assessment';
    return '';
  });

  constructor() {
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe((t) => {
      if (!this.editing && !this.remindersTouched) this.reminders.set([...DEFAULT_REMINDERS[t]]);
      this.prefillContact();
    });
    this.form.controls.job.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.prefillContact());
  }

  ngOnInit(): void {
    const request = this.store.form();
    const event = request.event;

    this.jobsApi.list({ view: 'all', sort: 'company', order: 'asc' }).subscribe({
      next: (jobs) => {
        this.jobs.set(jobs);
        this.prefillContact();
      },
      error: () => this.formError.set('Could not load your jobs.')
    });

    if (event) {
      const when = utcToZoned(event.startsAt, event.timeZone);
      this.form.patchValue({
        job: event.job._id,
        type: event.type,
        round: event.round ?? 'Technical',
        title: event.title ?? '',
        date: when.date,
        time: when.time,
        timeZone: event.timeZone,
        durationMinutes: event.durationMinutes,
        meetingLink: event.meetingLink ?? '',
        location: event.location ?? '',
        channel: event.channel ?? 'Email',
        prepNotes: event.prepNotes ?? ''
      });
      event.interviewers.forEach((i) => this.addInterviewer(i));
      this.reminders.set(event.reminders.map((r) => r.minutesBefore));
      this.remindersTouched = true;
    } else {
      if (request.jobId) this.form.patchValue({ job: request.jobId });
      if (request.date) this.form.patchValue({ date: request.date });
    }
  }

  invalid(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  addInterviewer(value?: Partial<Interviewer>): void {
    this.interviewers.push(
      this.fb.nonNullable.group(
        {
          name: [value?.name ?? ''],
          role: [value?.role ?? ''],
          email: [value?.email ?? '', Validators.email],
          phone: [value?.phone ?? '']
        },
        { validators: nameRequiredIfAny }
      )
    );
  }

  removeInterviewer(index: number): void {
    this.interviewers.removeAt(index);
  }

  toggleReminder(minutes: number): void {
    this.remindersTouched = true;
    this.reminders.update((list) => (list.includes(minutes) ? list.filter((m) => m !== minutes) : [...list, minutes]));
  }

  /** For recruiter calls and follow-ups, start with the recruiter saved on the job. */
  private prefillContact(): void {
    if (this.editing || this.interviewers.length) return;
    const t = this.form.controls.type.value;
    if (t === 'Interview' || t === 'Assessment') return;
    const job = this.jobs().find((j) => j._id === this.form.controls.job.value);
    const r = job?.recruiter;
    if (r && (r.name || r.email || r.phone)) this.addInterviewer({ name: r.name, email: r.email, phone: r.phone, role: 'Recruiter' });
  }

  submit(): void {
    this.formError.set('');
    this.serverErrors.set({});
    if (this.form.invalid || this.interviewers.invalid) {
      this.form.markAllAsTouched();
      this.interviewers.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const followUp = isFollowUpType(v.type);
    const payload: EventInput = {
      job: v.job,
      type: v.type,
      round: v.type === 'Interview' ? v.round : null,
      title: v.title.trim(),
      startsAt: zonedToUtc(v.date, v.time, v.timeZone).toISOString(),
      timeZone: v.timeZone,
      durationMinutes: Number(v.durationMinutes),
      meetingLink: followUp ? '' : v.meetingLink.trim(),
      location: followUp ? '' : v.location.trim(),
      channel: followUp ? v.channel : null,
      interviewers: this.interviewers
        .getRawValue()
        .filter((i) => i.name.trim())
        .map((i) => ({ name: i.name.trim(), role: i.role.trim(), email: i.email.trim(), phone: i.phone.trim() })),
      prepNotes: v.prepNotes.trim(),
      reminders: [...this.reminders()].sort((a, b) => b - a),
      updateJobStatus: !this.editing && !!this.advanceTo() && v.updateJobStatus
    };

    const current = this.store.form().event;
    const request = current ? this.store.update(current._id, payload) : this.store.create(payload);

    this.saving.set(true);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.store.closeForm();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.serverErrors.set(err.error?.errors ?? {});
        this.formError.set(
          err.status === 0
            ? 'Could not reach the server.'
            : err.error?.message ?? 'The event could not be saved. Try again.'
        );
      }
    });
  }
}
