import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from './auth.service';

/** The signed-in person's details and password. Phone and the two email addresses are optional. */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="hero">
      <h1>Profile</h1>
      <p class="sub">Your details and password. Only your name is required.</p>
    </section>

    <main class="page profile">
      <section class="panel" aria-labelledby="profile-details">
        <h3 id="profile-details">Your details</h3>
        <form [formGroup]="details" (ngSubmit)="saveDetails()" novalidate>
          <label class="field">
            <span>Sign-in email</span>
            <input [value]="auth.user()?.email" disabled />
            <small class="hint">This is the email you sign in with, and where password reset links are sent.</small>
          </label>
          <label class="field">
            <span>Name</span>
            <input formControlName="name" autocomplete="name" maxlength="80" />
            @if (detailError('name')) { <small class="err">{{ detailError('name') }}</small> }
          </label>
          <label class="field">
            <span>Phone number <small class="hint">(optional)</small></span>
            <input formControlName="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="25" placeholder="+91 98765 43210" />
            @if (detailError('phone')) { <small class="err">{{ detailError('phone') }}</small> }
          </label>
          <div class="grid two">
            <label class="field">
              <span>Official email <small class="hint">(optional)</small></span>
              <input formControlName="officialEmail" type="email" autocomplete="off" placeholder="you@company.com" />
              @if (detailError('officialEmail')) { <small class="err">{{ detailError('officialEmail') }}</small> }
            </label>
            <label class="field">
              <span>Personal email <small class="hint">(optional)</small></span>
              <input formControlName="personalEmail" type="email" autocomplete="off" placeholder="you@gmail.com" />
              @if (detailError('personalEmail')) { <small class="err">{{ detailError('personalEmail') }}</small> }
            </label>
          </div>
          @if (detailsError()) { <p class="banner err" role="alert">{{ detailsError() }}</p> }
          @if (detailsSaved()) { <p class="banner ok" role="status">Your details were saved.</p> }
          <div class="row-end">
            <button type="submit" class="btn primary" [disabled]="savingDetails()">{{ savingDetails() ? 'Saving…' : 'Save details' }}</button>
          </div>
        </form>
      </section>

      <section class="panel" aria-labelledby="profile-password">
        <h3 id="profile-password">Change password</h3>
        <form [formGroup]="password" (ngSubmit)="savePassword()" novalidate>
          <label class="field">
            <span>Current password</span>
            <input formControlName="current" [type]="show() ? 'text' : 'password'" autocomplete="current-password" maxlength="128" />
            @if (passwordMessage('current')) { <small class="err">{{ passwordMessage('current') }}</small> }
          </label>
          <label class="field">
            <span>New password</span>
            <input formControlName="next" [type]="show() ? 'text' : 'password'" autocomplete="new-password" maxlength="128" />
            @if (passwordMessage('next')) { <small class="err">{{ passwordMessage('next') }}</small> }
            @else { <small class="hint">At least 8 characters. Changing it signs out your other devices.</small> }
          </label>
          <label class="field">
            <span>Confirm new password</span>
            <input formControlName="confirm" [type]="show() ? 'text' : 'password'" autocomplete="new-password" maxlength="128" />
            @if (passwordMessage('confirm')) { <small class="err">{{ passwordMessage('confirm') }}</small> }
          </label>
          <label class="check">
            <input type="checkbox" [checked]="show()" (change)="show.set($any($event.target).checked)" />
            Show passwords
          </label>
          @if (passwordError()) { <p class="banner err" role="alert">{{ passwordError() }}</p> }
          @if (passwordSaved()) { <p class="banner ok" role="status">{{ passwordSaved() }}</p> }
          <div class="row-end">
            <button type="submit" class="btn primary" [disabled]="savingPassword()">{{ savingPassword() ? 'Saving…' : 'Change password' }}</button>
          </div>
        </form>
      </section>
    </main>
  `
})
export class ProfileComponent {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);

  readonly show = signal(false);
  readonly savingDetails = signal(false);
  readonly detailsSaved = signal(false);
  readonly detailsError = signal('');
  readonly savingPassword = signal(false);
  readonly passwordSaved = signal('');
  readonly passwordError = signal('');
  private readonly serverErrors = signal<Record<string, string>>({});

  readonly details = this.fb.nonNullable.group({
    name: [this.auth.user()?.name ?? '', [Validators.required, Validators.maxLength(80)]],
    phone: [this.auth.user()?.phone ?? ''],
    officialEmail: [this.auth.user()?.officialEmail ?? '', [Validators.email]],
    personalEmail: [this.auth.user()?.personalEmail ?? '', [Validators.email]]
  });

  readonly password = this.fb.nonNullable.group({
    current: ['', [Validators.required]],
    next: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', [Validators.required]]
  });

  detailError(field: 'name' | 'phone' | 'officialEmail' | 'personalEmail'): string {
    const server = this.serverErrors()[field];
    if (server) return server;
    const c = this.details.controls[field];
    if (!(c.touched || c.dirty) || c.valid) return '';
    return field === 'name' ? 'Enter your name.' : 'Enter a valid email address.';
  }

  passwordMessage(field: 'current' | 'next' | 'confirm'): string {
    const server = this.serverErrors()[field === 'current' ? 'currentPassword' : field === 'next' ? 'newPassword' : ''];
    if (server) return server;
    const c = this.password.controls[field];
    if (field === 'confirm') {
      return (c.touched || c.dirty) && c.value !== this.password.controls.next.value ? 'The two passwords do not match.' : '';
    }
    if (!(c.touched || c.dirty) || c.valid) return '';
    if (field === 'next' && c.errors?.['minlength']) return 'Use at least 8 characters.';
    return field === 'current' ? 'Enter your current password.' : 'Enter a new password.';
  }

  saveDetails(): void {
    this.detailsError.set('');
    this.detailsSaved.set(false);
    this.serverErrors.set({});
    if (this.details.invalid) {
      this.details.markAllAsTouched();
      return;
    }
    const v = this.details.getRawValue();
    this.savingDetails.set(true);
    this.auth
      .updateProfile({ name: v.name.trim(), phone: v.phone.trim(), officialEmail: v.officialEmail.trim(), personalEmail: v.personalEmail.trim() })
      .subscribe({
        next: () => {
          this.savingDetails.set(false);
          this.detailsSaved.set(true);
        },
        error: (err: HttpErrorResponse) => {
          this.savingDetails.set(false);
          this.serverErrors.set(err.error?.errors ?? {});
          this.detailsError.set(
            err.status === 0 ? 'Could not reach the server.' : err.error?.errors ? '' : err.error?.message ?? 'Your details could not be saved. Try again.'
          );
        }
      });
  }

  savePassword(): void {
    this.passwordError.set('');
    this.passwordSaved.set('');
    this.serverErrors.set({});
    const v = this.password.getRawValue();
    if (this.password.invalid || v.next !== v.confirm) {
      this.password.markAllAsTouched();
      this.password.controls.confirm.markAsDirty();
      return;
    }
    this.savingPassword.set(true);
    this.auth.changePassword(v.current, v.next).subscribe({
      next: (r) => {
        this.savingPassword.set(false);
        this.passwordSaved.set(r.message);
        this.password.reset({ current: '', next: '', confirm: '' });
      },
      error: (err: HttpErrorResponse) => {
        this.savingPassword.set(false);
        this.serverErrors.set(err.error?.errors ?? {});
        this.passwordError.set(
          err.status === 0 ? 'Could not reach the server.' : err.error?.errors ? '' : err.error?.message ?? 'The password could not be changed. Try again.'
        );
      }
    });
  }
}
