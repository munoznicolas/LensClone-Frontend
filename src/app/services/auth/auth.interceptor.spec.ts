import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { SettingsService } from '../settings/settings.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authMock: { getIdToken: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authMock = {
      getIdToken: vi.fn().mockReturnValue('google_id_token_abc'),
      signOut: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authMock },
        {
          provide: SettingsService,
          useValue: {
            backendApiUrl: signal('https://api.lensclone.example/api/v1/prices'),
          },
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should attach Bearer token to requests targeting the configured backend origin', () => {
    http.get('https://api.lensclone.example/api/v1/auth/me').subscribe();

    const req = httpMock.expectOne('https://api.lensclone.example/api/v1/auth/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer google_id_token_abc');
    req.flush({ isAdmin: false });
  });

  it('should not attach Bearer token to third-party origins', () => {
    http.get('https://mt1.google.com/vt/lyrs=m&x=0&y=0&z=0').subscribe();

    const req = httpMock.expectOne('https://mt1.google.com/vt/lyrs=m&x=0&y=0&z=0');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should call signOut when backend responds with 401 Unauthorized', () => {
    http.post('https://api.lensclone.example/api/v1/prices/submit', {}).subscribe({
      error: () => {
        // Expected 401
      },
    });

    const req = httpMock.expectOne('https://api.lensclone.example/api/v1/prices/submit');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(authMock.signOut).toHaveBeenCalledTimes(1);
  });
});
