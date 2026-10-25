import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from './auth.service';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

const TITLES: Record<Mode, string> = {
  login: 'Sign in',
  register: 'Create your account',
  forgot: 'Reset your password',
  reset: 'Choose a new password'
};
const INTROS: Record<Mode, string> = {
  login: 'Welcome back. Your applications are waiting.',
  register: 'Keep every application, note and contact in one private place.',
  forgot: 'Enter the email you signed up with and we will send you a link to choose a new password.',
  reset: 'Pick a new password for your account. You will sign in with it next.'
};

/** Sign in, create an account, ask for a reset link, or set a new password from a reset link. */
@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <main class="auth">
      <section class="auth-card" aria-labelledby="auth-title">
        <span class="brand">Job tracker</span>
        <h1 id="auth-title">{{ title() }}</h1>
        <p class="muted">{{ intro() }}</p>

        @if (notice()) {
          <p class="banner ok" role="status">{{ notice() }}</p>
          <button type="button" class="btn primary wide" (click)="goToLogin()">Back to sign in</button>
        } @else {
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            @if (mode() === 'register') {
              <label class="field">
                <span>Name</span>
                <input formControlName="name" autocomplete="name" maxlength="80" />
                @if (message('name')) { <small class="err">{{ message('name') }}</small> }
              </label>
            }
            @if (mode() !== 'reset') {
              <label class="field">
                <span>Email</span>
                <input formControlName="email" type="email" autocomplete="email" inputmode="email" />
                @if (message('email')) { <small class="err">{{ message('email') }}</small> }
              </label>
            }
            @if (mode() !== 'forgot') {
              <label class="field">
                <span>{{ mode() === 'reset' ? 'New password' : 'Password' }}</span>
                <input formControlName="password" [type]="show() ? 'text' : 'password'" maxlength="128"
                       [attr.autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'" />
                @if (message('password')) { <small class="err">{{ message('password') }}</small> }
                @else if (mode() !== 'login') { <small class="hint">At least 8 characters. A short sentence works well.</small> }
              </label>
            }
            @if (mode() === 'reset') {
              <label class="field">
                <span>Confirm new password</span>
                <input formControlName="confirm" [type]="show() ? 'text' : 'password'" maxlength="128" autocomplete="new-password" />
                @if (message('confirm')) { <small class="err">{{ message('confirm') }}</small> }
              </label>
            }
            @if (mode() !== 'forgot') {
              <div class="auth-options">
                <label class="check">
                  <input type="checkbox" [checked]="show()" (change)="show.set($any($event.target).checked)" />
                  Show password
                </label>
                @if (mode() === 'login') {
                  <button type="button" class="link" (click)="switchTo('forgot')">Forgot password?</button>
                }
              </div>
            }

            @if (formError()) { <p class="banner err" role="alert">{{ formError() }}</p> }

            <button type="submit" class="btn primary wide" [disabled]="busy()">{{ busy() ? 'Please wait…' : submitLabel() }}</button>
          </form>

          <p class="auth-switch muted">
            @switch (mode()) {
              @case ('login') { New here? <button type="button" class="link" (click)="switchTo('register')">Create an account</button> }
              @case ('register') { Already have an account? <button type="button" class="link" (click)="switchTo('login')">Sign in</button> }
              @default { <button type="button" class="link" (click)="goToLogin()">Back to sign in</button> }
            }
          </p>
        }
      </section>
    </main>
  `
})
export class AuthPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  /** Set when the page was opened from an emailed reset link. */
  readonly resetToken = input<string | null>(null);
  /** Fired when the reset link has been used up or abandoned. */
  readonly resetDone = output<void>();

  readonly mode = signal<Mode>('login');
  readonly show = signal(false);
  readonly busy = signal(false);
  readonly formError = signal('');
  readonly notice = signal('');
  private readonly serverErrors = signal<Record<string, string>>({});

  readonly form = this.fb.nonNullable.group({
    name: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    confirm: ['']
  });

  ngOnInit(): void {
    // Opened from a reset link: go straight to choosing a new password.
    if (this.resetToken()) this.switchTo('reset');
  }

  title(): string {
    return TITLES[this.mode()];
  }

  intro(): string {
    return INTROS[this.mode()];
  }

  submitLabel(): string {
    return { login: 'Sign in', register: 'Create account', forgot: 'Send reset link', reset: 'Change password' }[this.mode()];
  }

  switchTo(mode: Mode): void {
    this.mode.set(mode);
    this.formError.set('');
    this.notice.set('');
    this.serverErrors.set({});
    const c = this.form.controls;
    c.name.setValidators(mode === 'register' ? [Validators.required] : []);
    c.email.setValidators(mode === 'reset' ? [] : [Validators.required, Validators.email]);
    c.password.setValidators(
      mode === 'forgot' ? [] : mode === 'login' ? [Validators.required] : [Validators.required, Validators.minLength(8)]
    );
    for (const control of [c.name, c.email, c.password]) control.updateValueAndValidity();
    this.form.markAsUntouched();
  }

  goToLogin(): void {
    // A used or abandoned reset link must not bring the reset form back.
    if (this.resetToken()) this.resetDone.emit();
    this.form.controls.password.reset('');
    this.form.controls.confirm.reset('');
    this.switchTo('login');
  }

  /** The first problem to show under a field: a server message, or a local check once the field was touched. */
  message(field: 'name' | 'email' | 'password' | 'confirm'): string {
    const server = this.serverErrors()[field];
    if (server) return server;
    const c = this.form.controls[field];
    if (field === 'confirm') {
      return (c.touched || c.dirty) && c.value !== this.form.controls.password.value ? 'The two passwords do not match.' : '';
    }
    if (!(c.touched || c.dirty) || c.valid) return '';
    if (field === 'name') return 'Enter your name.';
    if (field === 'email') return 'Enter a valid email address.';
    return c.errors?.['minlength'] ? 'Use at least 8 characters.' : 'Enter your password.';
  }

  submit(): void {
    this.formError.set('');
    this.serverErrors.set({});
    const mode = this.mode();
    const v = this.form.getRawValue();
    if (this.form.invalid || (mode === 'reset' && v.password !== v.confirm)) {
      this.form.markAllAsTouched();
      this.form.controls.confirm.markAsDirty();
      return;
    }

    this.busy.set(true);
    const done = () => this.busy.set(false);
    const fail = (err: HttpErrorResponse) => {
      done();
      this.serverErrors.set(err.error?.errors ?? {});
      this.formError.set(
        err.status === 0
          ? 'Could not reach the server. Check that the API is running on port 3000.'
          : err.error?.errors ? '' : err.error?.message ?? 'Something went wrong. Try again.'
      );
    };

    if (mode === 'forgot') {
      this.auth.forgotPassword(v.email.trim()).subscribe({ next: (r) => { done(); this.notice.set(r.message); }, error: fail });
    } else if (mode === 'reset') {
      this.auth.resetPassword(this.resetToken() as string, v.password).subscribe({
        next: (r) => { done(); this.notice.set(r.message); },
        error: fail
      });
    } else if (mode === 'login') {
      // The root component swaps to the app as soon as the user is set.
      this.auth.login({ email: v.email.trim(), password: v.password }).subscribe({ next: done, error: fail });
    } else {
      this.auth.register({ name: v.name.trim(), email: v.email.trim(), password: v.password }).subscribe({ next: done, error: fail });
    }
  }
}
