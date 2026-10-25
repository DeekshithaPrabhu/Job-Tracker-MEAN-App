import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

export interface User {
  id: string;
  name: string;
  /** The sign-in email. It is not editable from the Profile page. */
  email: string;
  /** Optional details from the Profile page. */
  phone?: string;
  officialEmail?: string;
  personalEmail?: string;
}

export interface ProfileInput {
  name: string;
  phone: string;
  officialEmail: string;
  personalEmail: string;
}

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Who is signed in. The session itself is an httpOnly cookie that the browser sends on its own,
 * so no token is ever kept in script-readable storage.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly user = signal<User | null>(null);
  /** False until the first check of the cookie has finished. */
  readonly ready = signal(false);

  /** Asks the server whether the cookie is a valid session. */
  restore(): void {
    this.http.get<User>('/api/auth/me').subscribe({
      next: (user) => {
        this.user.set(user);
        this.ready.set(true);
      },
      error: () => {
        this.user.set(null);
        this.ready.set(true);
      }
    });
  }

  login(credentials: Credentials): Observable<User> {
    return this.http.post<User>('/api/auth/login', credentials).pipe(tap((user) => this.user.set(user)));
  }

  register(details: Credentials & { name: string }): Observable<User> {
    return this.http.post<User>('/api/auth/register', details).pipe(tap((user) => this.user.set(user)));
  }

  /** Asks for a reset link. The answer is the same whether or not the email has an account. */
  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/forgot', { email });
  }

  resetPassword(token: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/reset', { token, password });
  }

  updateProfile(profile: ProfileInput): Observable<User> {
    return this.http.patch<User>('/api/auth/profile', profile).pipe(tap((user) => this.user.set(user)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/password', { currentPassword, newPassword });
  }

  /** Ends the session, then reloads so nothing from this account stays in memory. */
  logout(): void {
    const done = () => window.location.reload();
    this.http.post('/api/auth/logout', {}).subscribe({ next: done, error: done });
  }
}
