import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService, GOOGLE_OIDC_AUTHORIZE_URL } from './auth.service';
import { SettingsService } from '../settings/settings.service';
import { signal } from '@angular/core';

function createJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${body}.mockSignature`;
}

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let localStore: Map<string, string>;
  let sessionStore: Map<string, string>;

  beforeEach(() => {
    localStore = new Map<string, string>();
    sessionStore = new Map<string, string>();

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStore.get(key) ?? null,
      setItem: (key: string, value: string) => localStore.set(key, value),
      removeItem: (key: string) => localStore.delete(key),
      clear: () => localStore.clear(),
      length: 0,
      key: () => null,
    });

    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => sessionStore.get(key) ?? null,
      setItem: (key: string, value: string) => sessionStore.set(key, value),
      removeItem: (key: string) => sessionStore.delete(key),
      clear: () => sessionStore.clear(),
      length: 0,
      key: () => null,
    });

    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SettingsService,
          useValue: {
            backendApiUrl: signal('https://api.example.com/api/v1/prices'),
          },
        },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.unstubAllGlobals();
  });

  it('should initialize as anonymous and non-admin', () => {
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.isAdmin()).toBe(false);
    expect(service.authError()).toBeNull();
  });

  it('should report error when GOOGLE_CLIENT_ID placeholder is unconfigured', () => {
    const navigate = vi.fn();
    service.signInWithGoogle(navigate);

    expect(navigate).not.toHaveBeenCalled();
    expect(service.authError()).toContain('Client ID is not configured');
  });

  it('should build Google OIDC redirect URL with state and nonce in sessionStorage', () => {
    const navigate = vi.fn();
    service.signInWithGoogle(navigate, 'my-client-id.apps.googleusercontent.com');

    expect(navigate).toHaveBeenCalledTimes(1);
    const url = new URL(navigate.mock.calls[0][0]);
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_OIDC_AUTHORIZE_URL);
    expect(url.searchParams.get('client_id')).toBe('my-client-id.apps.googleusercontent.com');
    expect(url.searchParams.get('response_type')).toBe('id_token');
    expect(url.searchParams.get('scope')).toBe('openid email profile');

    const saved = JSON.parse(sessionStore.get('lens_clone_google_oauth_state') || '{}');
    expect(url.searchParams.get('state')).toBe(saved.state);
    expect(url.searchParams.get('nonce')).toBe(saved.nonce);
    expect(saved.state.length).toBe(32);
    expect(saved.nonce.length).toBe(32);
  });

  it('should parse OAuth redirect hash, verify state/nonce, strip hash, and verify admin via /api/v1/auth/me', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = createJwt({
      sub: 'google_sub_999',
      name: 'Admin User',
      email: 'admin@example.com',
      picture: 'https://example.com/avatar.jpg',
      nonce: 'expected_nonce_1',
      exp: futureExp,
    });

    sessionStore.set(
      'lens_clone_google_oauth_state',
      JSON.stringify({ state: 'expected_state_1', nonce: 'expected_nonce_1' }),
    );
    window.history.replaceState(null, '', '/#id_token=' + encodeURIComponent(token) + '&state=expected_state_1');

    service.handleOAuthRedirectCallback();

    expect(window.location.hash).toBe('');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.email).toBe('admin@example.com');
    expect(service.isAdmin()).toBe(false);

    await Promise.resolve();

    const req = httpMock.expectOne('https://api.example.com/api/v1/auth/me');
    expect(req.request.method).toBe('GET');
    req.flush({ userId: 'google_sub_999', email: 'admin@example.com', name: 'Admin User', isAdmin: true });

    expect(service.isAdmin()).toBe(true);
  });

  it('should reject OAuth redirect when state or nonce mismatches', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = createJwt({
      sub: 'google_sub_999',
      email: 'admin@example.com',
      nonce: 'wrong_nonce',
      exp: futureExp,
    });

    sessionStore.set(
      'lens_clone_google_oauth_state',
      JSON.stringify({ state: 'expected_state', nonce: 'expected_nonce' }),
    );
    window.history.replaceState(null, '', '/#id_token=' + encodeURIComponent(token) + '&state=wrong_state');

    service.handleOAuthRedirectCallback();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.isAdmin()).toBe(false);
    expect(service.authError()).toContain('state mismatch');

    sessionStore.set(
      'lens_clone_google_oauth_state',
      JSON.stringify({ state: 'expected_state', nonce: 'expected_nonce' }),
    );
    window.history.replaceState(null, '', '/#id_token=' + encodeURIComponent(token) + '&state=expected_state');

    service.handleOAuthRedirectCallback();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.authError()).toContain('nonce mismatch');
  });

  it('should reject expired tokens and fail closed on non-401 or 401 errors from /api/v1/auth/me', async () => {
    const expiredToken = createJwt({
      sub: 'sub_expired',
      email: 'user@example.com',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    expect(service.handleGoogleCredential(expiredToken)).toBe(false);
    expect(service.isAuthenticated()).toBe(false);

    const validToken = createJwt({
      sub: 'sub_valid',
      email: 'user@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(service.handleGoogleCredential(validToken)).toBe(true);
    await Promise.resolve();

    const req1 = httpMock.expectOne('https://api.example.com/api/v1/auth/me');
    req1.flush({ userId: 'sub_valid', email: 'user@example.com', isAdmin: false });
    expect(service.isAdmin()).toBe(false);
    expect(service.isAuthenticated()).toBe(true);

    service.verifyAdminStatus();
    const req2 = httpMock.expectOne('https://api.example.com/api/v1/auth/me');
    req2.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(service.isAuthenticated()).toBe(false);
    expect(service.isAdmin()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });

  it('should clear user, admin status, and storage on signOut', async () => {
    const validToken = createJwt({
      sub: 'sub_1',
      email: 'admin@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    service.handleGoogleCredential(validToken);
    await Promise.resolve();
    httpMock.expectOne('https://api.example.com/api/v1/auth/me').flush({ isAdmin: true });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.isAdmin()).toBe(true);

    service.signOut();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.isAdmin()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(localStore.has('lens_clone_auth_v1')).toBe(false);
  });
});
