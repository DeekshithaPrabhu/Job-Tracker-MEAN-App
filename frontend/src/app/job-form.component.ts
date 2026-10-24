import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CURRENCIES, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, Job, JobInput, PRIORITIES, STATUSES, WORK_MODES
} from './job.model';
import { JobService } from './job.service';

@Component({
  selector: 'app-job-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="scrim" (click)="closed.emit()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" [attr.aria-label]="job() ? 'Edit job' : 'Save a job'">
      <header class="drawer-head">
        <h2>{{ job() ? 'Edit job' : 'Save a job' }}</h2>
        <button type="button" class="btn ghost" (click)="closed.emit()" aria-label="Close form">Close</button>
      </header>

      <form [formGroup]="form" (ngSubmit)="submit()" class="drawer-body" novalidate>
        <fieldset>
          <legend>The role</legend>
          <div class="grid two">
            <label class="field">
              <span>Company name</span>
              <input formControlName="company" autocomplete="off" />
              @if (invalid('company')) { <small class="err">Enter the company name.</small> }
            </label>
            <label class="field">
              <span>Job title</span>
              <input formControlName="title" autocomplete="off" />
              @if (invalid('title')) { <small class="err">Enter the job title.</small> }
            </label>
          </div>
          <div class="grid two">
            <label class="field">
              <span>Location</span>
              <input formControlName="location" placeholder="City, country" />
            </label>
            <label class="field">
              <span>Work mode</span>
              <select formControlName="workMode">
                @for (m of workModes; track m) { <option [value]="m">{{ m }}</option> }
              </select>
            </label>
          </div>
          <div class="grid two">
            <label class="field">
              <span>Employment type</span>
              <select formControlName="employmentType">
                @for (t of employmentTypes; track t) { <option [value]="t">{{ t }}</option> }
              </select>
            </label>
            <label class="field">
              <span>Experience level</span>
              <select formControlName="experienceLevel">
                @for (l of levels; track l) { <option [value]="l">{{ l }}</option> }
              </select>
            </label>
          </div>
          <div class="grid two">
            <label class="field">
              <span>Status</span>
              <select formControlName="status">
                @for (st of statuses; track st) { <option [value]="st">{{ st }}</option> }
              </select>
              @if (job()) { <small class="hint">Changing the status adds an entry to this job's history.</small> }
            </label>
            <label class="field">
              <span>Priority</span>
              <select formControlName="priority">
                @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Posting</legend>
          <div class="grid two">
            <label class="field">
              <span>Job posting URL</span>
              <input formControlName="postingUrl" type="url" placeholder="https://" />
              @if (serverErrors()['postingUrl']) { <small class="err">{{ serverErrors()['postingUrl'] }}</small> }
            </label>
            <label class="field">
              <span>Date saved</span>
              <input formControlName="dateSaved" type="date" />
            </label>
          </div>
          <label class="field">
            <span>Date applied</span>
            <input formControlName="appliedAt" type="date" />
            <small class="hint">Filled in automatically when the job moves to Applied. Set it here if you applied earlier.</small>
          </label>
          <label class="field">
            <span>Job description</span>
            <textarea formControlName="description" rows="5"></textarea>
          </label>
          <label class="field">
            <span>Required skills</span>
            <input formControlName="skills" placeholder="Angular, TypeScript, MongoDB" />
            <small class="hint">Separate skills with commas.</small>
          </label>
        </fieldset>

        <fieldset>
          <legend>Salary range</legend>
          <div class="grid three">
            <label class="field">
              <span>Currency</span>
              <select formControlName="currency">
                @for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }
              </select>
            </label>
            <label class="field">
              <span>Minimum</span>
              <input formControlName="salaryMin" type="number" min="0" inputmode="numeric" />
            </label>
            <label class="field">
              <span>Maximum</span>
              <input formControlName="salaryMax" type="number" min="0" inputmode="numeric" />
            </label>
          </div>
          @if (serverErrors()['salary.max']) { <small class="err">{{ serverErrors()['salary.max'] }}</small> }
        </fieldset>

        <fieldset>
          <legend>Recruiter</legend>
          <div class="grid two">
            <label class="field">
              <span>Name</span>
              <input formControlName="recruiterName" autocomplete="off" />
            </label>
            <label class="field">
              <span>Email</span>
              <input formControlName="recruiterEmail" type="email" autocomplete="off" />
              @if (invalid('recruiterEmail')) { <small class="err">Enter a valid email address.</small> }
            </label>
          </div>
          <div class="grid two">
            <label class="field">
              <span>Phone</span>
              <input formControlName="recruiterPhone" type="tel" />
            </label>
            <label class="field">
              <span>Profile link</span>
              <input formControlName="recruiterLinkedin" type="url" placeholder="https://linkedin.com/in/…" />
            </label>
          </div>
        </fieldset>

        @if (formError()) { <p class="banner err" role="alert">{{ formError() }}</p> }

        <footer class="drawer-foot">
          <button type="button" class="btn ghost" (click)="closed.emit()">Cancel</button>
          <button type="submit" class="btn primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : job() ? 'Save changes' : 'Save job' }}
          </button>
        </footer>
      </form>
    </aside>
  `
})
export class JobFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly jobs = inject(JobService);

  readonly job = input<Job | null>(null);
  readonly saved = output<Job>();
  readonly closed = output<void>();

  readonly workModes = WORK_MODES;
  readonly employmentTypes = EMPLOYMENT_TYPES;
  readonly levels = EXPERIENCE_LEVELS;
  readonly currencies = CURRENCIES;
  readonly statuses = STATUSES;
  readonly priorities = PRIORITIES;

  readonly saving = signal(false);
  readonly formError = signal('');
  readonly serverErrors = signal<Record<string, string>>({});

  readonly form = this.fb.nonNullable.group({
    company: ['', [Validators.required, Validators.maxLength(150)]],
    title: ['', [Validators.required, Validators.maxLength(150)]],
    location: [''],
    workMode: ['On-site'],
    employmentType: ['Full-time'],
    experienceLevel: ['Mid'],
    status: ['Saved / Interested'],
    priority: ['Medium'],
    postingUrl: [''],
    dateSaved: [new Date().toISOString().slice(0, 10)],
    appliedAt: [''],
    description: [''],
    skills: [''],
    currency: ['USD'],
    salaryMin: [null as number | null],
    salaryMax: [null as number | null],
    recruiterName: [''],
    recruiterEmail: ['', [Validators.email]],
    recruiterPhone: [''],
    recruiterLinkedin: ['']
  });

  ngOnInit(): void {
    const j = this.job();
    if (!j) return;
    this.form.patchValue({
      company: j.company,
      title: j.title,
      location: j.location ?? '',
      workMode: j.workMode,
      employmentType: j.employmentType,
      experienceLevel: j.experienceLevel,
      status: j.status ?? 'Saved / Interested',
      postingUrl: j.postingUrl ?? '',
      dateSaved: j.dateSaved ? j.dateSaved.slice(0, 10) : '',
      priority: j.priority ?? 'Medium',
      appliedAt: j.appliedAt ? j.appliedAt.slice(0, 10) : '',
      description: j.description ?? '',
      skills: (j.skills ?? []).join(', '),
      currency: j.salary?.currency ?? 'USD',
      salaryMin: j.salary?.min ?? null,
      salaryMax: j.salary?.max ?? null,
      recruiterName: j.recruiter?.name ?? '',
      recruiterEmail: j.recruiter?.email ?? '',
      recruiterPhone: j.recruiter?.phone ?? '',
      recruiterLinkedin: j.recruiter?.linkedin ?? ''
    });
  }

  invalid(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  submit(): void {
    this.formError.set('');
    this.serverErrors.set({});
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const num = (n: number | null) => (n === null || (n as unknown) === '' ? null : Number(n));
    const payload: JobInput = {
      company: v.company.trim(),
      title: v.title.trim(),
      location: v.location.trim(),
      workMode: v.workMode as JobInput['workMode'],
      employmentType: v.employmentType as JobInput['employmentType'],
      experienceLevel: v.experienceLevel as JobInput['experienceLevel'],
      status: v.status as JobInput['status'],
      priority: v.priority as JobInput['priority'],
      appliedAt: v.appliedAt ? new Date(v.appliedAt).toISOString() : null,
      postingUrl: v.postingUrl.trim(),
      dateSaved: v.dateSaved ? new Date(v.dateSaved).toISOString() : new Date().toISOString(),
      description: v.description.trim(),
      skills: v.skills.split(',').map((s) => s.trim()).filter(Boolean),
      salary: { min: num(v.salaryMin), max: num(v.salaryMax), currency: v.currency },
      recruiter: {
        name: v.recruiterName.trim(),
        email: v.recruiterEmail.trim(),
        phone: v.recruiterPhone.trim(),
        linkedin: v.recruiterLinkedin.trim()
      }
    };

    const current = this.job();
    const request = current ? this.jobs.update(current._id, payload) : this.jobs.create(payload);

    this.saving.set(true);
    request.subscribe({
      next: (job) => {
        this.saving.set(false);
        this.saved.emit(job);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.serverErrors.set(err.error?.errors ?? {});
        this.formError.set(
          err.status === 0
            ? 'Could not reach the server. Check that the API is running on port 3000.'
            : err.error?.message ?? 'The job could not be saved. Try again.'
        );
      }
    });
  }
}
