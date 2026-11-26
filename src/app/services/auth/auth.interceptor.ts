import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { SettingsService } from '../settings/settings.service';

function resolveOrigin(url: string): string | null {
  try {
    const fallbackBase =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    return new URL(url, fallbackBase).origin;
  } catch {
    return null;
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const settings = inject(SettingsService);
  const auth = inject(AuthService);

  const reqOrigin = resolveOrigin(req.url);
  const backendOrigin = resolveOrigin(settings.backendApiUrl());
  const isBackendRequest = reqOrigin !== null && backendOrigin !== null && reqOrigin === backendOrigin;

  if (!isBackendRequest) {
    return next(req);
  }

  const token = auth.getIdToken();
  const outgoingReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(outgoingReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.signOut();
      }
      return throwError(() => error);
    }),
  );
};
