import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { JobDetailsService } from './job-details.service';
import { CONTACT_ROLES, Contact, ContactInput, ContactRole, Job } from './job.model';

/** Recruiters, hiring managers and referral contacts for one application. */
@Component({
  selector: 'app-job-contacts',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="panel">
      <div class="panel-head">
        <h3>People</h3>
        @if (!formOpen()) { <button type="button" class="btn small" (click)="startAdd()">Add contact</button> }
      </div>

      @if (formOpen()) {
        <form [formGroup]="form" (ngSubmit)="submit()" class="contact-form" novalidate>
          <div class="grid two">
            <label class="field">
              <span>Name</span>
              <input formControlName="name" autocomplete="off" />
              @if (fieldError('name')) { <small class="err">{{ fieldError('name') }}</small> }
            </label>
            <label class="field">
              <span>Role</span>
              <select formControlName="role">
                @for (r of roles; track r) { <option [value]="r">{{ r }}</option> }
              </select>
            </label>
          </div>
          <div class="grid two">
            <label class="field">
              <span>Email</span>
              <input formControlName="email" type="email" autocomplete="off" />
              @if (fieldError('email')) { <small class="err">{{ fieldError('email') }}</small> }
            </label>
            <label class="field">
              <span>Phone</span>
              <input formControlName="phone" type="tel" autocomplete="off" />
            </label>
          </div>
          <div class="grid two">
            <label class="field">
              <span>Company or team</span>
              <input formControlName="company" autocomplete="off" placeholder="Optional, useful for referrals" />
            </label>
            <label class="field">
              <span>Profile link</span>
              <input formControlName="linkedin" type="url" placeholder="https://linkedin.com/in/…" />
              @if (fieldError('linkedin')) { <small class="err">{{ fieldError('linkedin') }}</small> }
            </label>
          </div>
          <label class="field">
            <span>Notes</span>
            <textarea formControlName="notes" rows="3" maxlength="2000" placeholder="How you met, what they offered to do, when to follow up."></textarea>
          </label>
          @if (formError()) { <p class="banner err" role="alert">{{ formError() }}</p> }
          <div class="row-end">
            <button type="button" class="btn ghost" (click)="cancel()">Cancel</button>
            <button type="submit" class="btn primary" [disabled]="saving()">{{ saving() ? 'Saving…' : editingId() ? 'Save changes' : 'Add contact' }}</button>
          </div>
        </form>
      }

      @if (groups().length) {
        @for (g of groups(); track g.role) {
          <h4 class="sub-h">{{ g.role }}{{ g.contacts.length > 1 ? 's' : '' }}</h4>
          <ul class="contact-list">
            @for (c of g.contacts; track c._id) {
              <li class="contact">
                <div class="contact-main">
                  <strong>{{ c.name }}</strong>
                  @if (c.company) { <span class="muted small-text">{{ c.company }}</span> }
                  <span class="contact-links small-text">
                    @if (c.email) { <a [href]="'mailto:' + c.email">{{ c.email }}</a> }
                    @if (c.phone) { <a [href]="'tel:' + c.phone">{{ c.phone }}</a> }
                    @if (c.linkedin) { <a [href]="c.linkedin" target="_blank" rel="noopener noreferrer">Profile</a> }
                  </span>
                  @if (c.notes) { <p class="contact-notes small-text">{{ c.notes }}</p> }
                </div>
                <div class="contact-actions">
                  <button type="button" class="btn small ghost" (click)="startEdit(c)">Edit</button>
                  <button type="button" class="btn small ghost danger" (click)="remove(c)">Remove</button>
                </div>
              </li>
            }
          </ul>
        }
      } @else if (!formOpen()) {
        <p class="muted">No contacts yet. Add the recruiter, the hiring manager, or someone who referred you.</p>
      }
      @if (listError()) { <p class="banner err" role="alert">{{ listError() }}</p> }
    </section>
  `
})
export class JobContactsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(JobDetailsService);

  readonly job = input.required<Job>();
  readonly updated = output<Job>();

  readonly roles = CONTACT_ROLES;
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly listError = signal('');
  private readonly serverErrors = signal<Record<string, string>>({});

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    role: ['Recruiter' as ContactRole],
    company: [''],
    email: ['', [Validators.email]],
    phone: [''],
    linkedin: [''],
    notes: ['']
  });

  /** Contacts grouped by role, in the order recruiters, hiring managers, referrals, others. */
  readonly groups = computed(() => {
    const all = this.job().contacts ?? [];
    return CONTACT_ROLES.map((role) => ({ role, contacts: all.filter((c) => (c.role ?? 'Other') === role) })).filter((g) => g.contacts.length);
  });

  startAdd(): void {
    this.resetForm();
    this.form.reset({ name: '', role: 'Recruiter', company: '', email: '', phone: '', linkedin: '', notes: '' });
    this.formOpen.set(true);
  }

  startEdit(c: Contact): void {
    this.resetForm();
    this.form.reset({
      name: c.name, role: c.role ?? 'Other', company: c.company ?? '', email: c.email ?? '',
      phone: c.phone ?? '', linkedin: c.linkedin ?? '', notes: c.notes ?? ''
    });
    this.editingId.set(c._id);
    this.formOpen.set(true);
  }

  cancel(): void {
    this.resetForm();
    this.formOpen.set(false);
  }

  fieldError(field: string): string {
    const server = Object.entries(this.serverErrors()).find(([key]) => key === field || key.endsWith(`.${field}`));
    if (server) return server[1];
    const c = this.form.get(field);
    if (!c || !(c.touched || c.dirty) || c.valid) return '';
    return field === 'email' ? 'Enter a valid email address.' : 'Enter a name.';
  }

  submit(): void {
    this.formError.set('');
    this.serverErrors.set({});
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: ContactInput = {
      name: v.name.trim(), role: v.role, company: v.company.trim(), email: v.email.trim(),
      phone: v.phone.trim(), linkedin: v.linkedin.trim(), notes: v.notes.trim()
    };
    const id = this.editingId();
    const jobId = this.job()._id;

    this.saving.set(true);
    (id ? this.api.updateContact(jobId, id, payload) : this.api.addContact(jobId, payload)).subscribe({
      next: (job) => {
        this.saving.set(false);
        this.cancel();
        this.updated.emit(job);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.serverErrors.set(err.error?.errors ?? {});
        this.formError.set(err.status === 0 ? 'Could not reach the server.' : err.error?.message ?? 'The contact could not be saved. Try again.');
      }
    });
  }

  remove(c: Contact): void {
    if (!confirm(`Remove ${c.name} from this job?`)) return;
    this.listError.set('');
    this.api.deleteContact(this.job()._id, c._id).subscribe({
      next: (job) => this.updated.emit(job),
      error: () => this.listError.set('The contact could not be removed. Try again.')
    });
  }

  private resetForm(): void {
    this.editingId.set(null);
    this.formError.set('');
    this.serverErrors.set({});
  }
}
