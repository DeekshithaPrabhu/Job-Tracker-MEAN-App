import { Component, inject, signal } from '@angular/core';
import { AppComponent } from './app.component';
import { AuthPageComponent } from './auth-page.component';
import { AuthService } from './auth.service';

/** Takes the reset token out of the address bar right away, so it is not left in history or bookmarks. */
function takeResetToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('reset');
  if (token !== null) {
    params.delete('reset');
    const rest = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
  }
  return token || null;
}

/** Shows the sign-in page or the app. Nothing of the app is created until someone is signed in. */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AppComponent, AuthPageComponent],
  template: `
    @if (!auth.ready()) {
      <p class="auth-loading muted" role="status">Loading…</p>
    } @else if (resetToken()) {
      <app-auth-page [resetToken]="resetToken()" (resetDone)="finishReset()" />
    } @else if (auth.user()) {
      <app-workspace />
    } @else {
      <app-auth-page />
    }
  `
})
export class RootComponent {
  readonly auth = inject(AuthService);
  readonly resetToken = signal<string | null>(takeResetToken());

  constructor() {
    this.auth.restore();
  }

  /** The reset link is finished with. Whoever was signed in on this browser is asked to sign in again. */
  finishReset(): void {
    this.resetToken.set(null);
    this.auth.user.set(null);
  }
}
