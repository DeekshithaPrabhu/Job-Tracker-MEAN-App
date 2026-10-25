import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * Sends the session cookie with every API call, and returns to the sign-in page when the
 * session has ended (for example it expired). Sign-in and register errors are left to their forms.
 */
// These calls are made while signed out (or are the sign-out itself), so a 401 from them is an answer, not an expired session.
const SIGNED_OUT_CALLS = ['/api/auth/login', '/api/auth/register', '/api/auth/forgot', '/api/auth/reset', '/api/auth/logout', '/api/auth/me'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const authCall = SIGNED_OUT_CALLS.includes(req.url);
  return next(req.clone({ withCredentials: true })).pipe(
    catchError((err: HttpErrorResponse) => {
      // A reload is safe: the app then asks /api/auth/me first and shows the sign-in page.
      if (err.status === 401 && !authCall) window.location.reload();
      return throwError(() => err);
    })
  );
};
