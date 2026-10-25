import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { JobDetailsService } from './job-details.service';
import { Job } from './job.model';

const MAX = 10000;

/** Private notes about the company and the recruiter. */
@Component({
  selector: 'app-job-notes',
  standalone: true,
  template: `
    <section class="panel">
      <label class="field">
        <span>About the company</span>
        <textarea rows="7" [maxLength]="max" [value]="company()" placeholder="What they do, culture, news, questions you want to ask, what you liked or worried about."
                  (input)="company.set($any($event.target).value)"></textarea>
        <small class="hint">{{ company().length }} of {{ max }}</small>
      </label>
    </section>

    <section class="panel">
      <label class="field">
        <span>About the recruiter</span>
        <textarea rows="7" [maxLength]="max" [value]="recruiter()" placeholder="How they prefer to be contacted, what they said about the role, salary hints, promised next steps."
                  (input)="recruiter.set($any($event.target).value)"></textarea>
        <small class="hint">{{ recruiter().length }} of {{ max }}</small>
      </label>
    </section>

    @if (error()) { <p class="banner err" role="alert">{{ error() }}</p> }

    <div class="save-bar">
      <span class="muted small-text" role="status">
        {{ saving() ? 'Saving…' : dirty() ? 'You have unsaved changes.' : savedAt() ? 'Saved.' : 'Only you can see these notes.' }}
      </span>
      <button type="button" class="btn small ghost" [disabled]="!dirty() || saving()" (click)="reset()">Discard</button>
      <button type="button" class="btn primary" [disabled]="!dirty() || saving()" (click)="save()">Save notes</button>
    </div>
  `
})
export class JobNotesComponent {
  private readonly api = inject(JobDetailsService);

  readonly job = input.required<Job>();
  readonly updated = output<Job>();
  readonly max = MAX;

  readonly company = signal('');
  readonly recruiter = signal('');
  readonly saving = signal(false);
  readonly error = signal('');
  readonly savedAt = signal(false);

  private baseline = { company: '', recruiter: '' };

  readonly dirty = computed(() => {
    const j = this.job();
    return this.company() !== (j.companyNotes ?? '') || this.recruiter() !== (j.recruiterNotes ?? '');
  });

  constructor() {
    // Load the saved text, and refresh it when the job changes, unless the person is mid-edit.
    effect(() => {
      const j = this.job();
      const next = { company: j.companyNotes ?? '', recruiter: j.recruiterNotes ?? '' };
      untracked(() => {
        const editing = this.company() !== this.baseline.company || this.recruiter() !== this.baseline.recruiter;
        if (!editing || j._id !== this.currentId) {
          this.company.set(next.company);
          this.recruiter.set(next.recruiter);
        }
        this.baseline = next;
        this.currentId = j._id;
      });
    });
  }

  private currentId = '';

  reset(): void {
    this.company.set(this.baseline.company);
    this.recruiter.set(this.baseline.recruiter);
    this.error.set('');
  }

  save(): void {
    this.saving.set(true);
    this.error.set('');
    this.api.saveNotes(this.job()._id, { companyNotes: this.company(), recruiterNotes: this.recruiter() }).subscribe({
      next: (job) => {
        this.saving.set(false);
        this.savedAt.set(true);
        this.updated.emit(job);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(err.status === 0 ? 'Could not reach the server.' : err.error?.message ?? 'The notes could not be saved. Try again.');
      }
    });
  }
}
