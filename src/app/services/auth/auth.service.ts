import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { SettingsService } from '../settings/settings.service';
import { I18nService } from '../i18n/i18n.service';

declare const __GOOGLE_CLIENT_ID__: string | undefined;

export const GOOGLE_CLIENT_ID =
  typeof __GOOGLE_CLIENT_ID__ !== 'undefined' && __GOOGLE_CLIENT_ID__
    ? __GOOGLE_CLIENT_ID__
    : 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
export const GOOGLE_OIDC_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  idToken: string;
  exp?: number;
}

interface AuthMeResponse {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  isAdmin: boolean;
}

interface GoogleJwtPayload {
  sub?: string;
  name?: string;
  given_name?: string;
  email?: string;
  picture?: string;
  exp?: number;
  nonce?: string;
}

const AUTH_STORAGE_KEY = 'lens_clone_auth_v1';
const OAUTH_STATE_STORAGE_KEY = 'lens_clone_google_oauth_state';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly settings = inject(SettingsService, { optional: true });
  private readonly i18n = inject(I18nService, { optional: true });

  private readonly _currentUser = signal<UserProfile | null>(null);
  private readonly _isAdmin = signal<boolean>(false);
  private readonly _authError = signal<string | null>(null);

  readonly currentUser = computed(() => this._currentUser());
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly isAdmin = this._isAdmin.asReadonly();
  readonly authError = this._authError.asReadonly();

  constructor() {
    this.handleOAuthRedirectCallback();
    if (!this._currentUser() && !this._authError()) {
      const stored = this.loadFromStorage();
      if (stored) {
        this._currentUser.set(stored);
        // Defer HTTP call so authInterceptor does not inject AuthService during its own construction (NG0200).
        queueMicrotask(() => this.verifyAdminStatus());
      }
    }
  }

  // shortcut: Google OIDC implicit id_token flow expires in 1h with no silent refresh; upgrade to backend OAuth code exchange if longer sessions are needed
  signInWithGoogle(navigate?: (url: string) => void, clientId: string = GOOGLE_CLIENT_ID): void {
    if (!clientId || clientId.startsWith('YOUR_GOOGLE_CLIENT_ID')) {
      this._authError.set(
        this.i18n?.t('auth.error.missingClientId') ?? 'Google OAuth Client ID is not configured.',
      );
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const state = this.generateRandomHex(16);
    const nonce = this.generateRandomHex(16);

    try {
      sessionStorage?.setItem(OAUTH_STATE_STORAGE_KEY, JSON.stringify({ state, nonce }));
    } catch (e) {
      console.warn('Failed to persist OAuth state to sessionStorage:', e);
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: window.location.origin,
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce,
      state,
      prompt: 'select_account',
    });

    this._authError.set(null);
    const authUrl = `${GOOGLE_OIDC_AUTHORIZE_URL}?${params.toString()}`;
    if (navigate) {
      navigate(authUrl);
    } else {
      window.location.assign(authUrl);
    }
  }

  handleOAuthRedirectCallback(): void {
    if (typeof window === 'undefined' || !window.location?.hash) {
      return;
    }

    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(rawHash);
    const idToken = params.get('id_token');
    const oauthError = params.get('error');

    if (!idToken && !oauthError) {
      return;
    }

    if (typeof window.history?.replaceState === 'function') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    let expectedState: string | undefined;
    let expectedNonce: string | undefined;
    try {
      const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(OAUTH_STATE_STORAGE_KEY) : null;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);
      }
      if (stored) {
        const parsed = JSON.parse(stored) as { state?: string; nonce?: string };
        expectedState = parsed.state;
        expectedNonce = parsed.nonce;
      }
    } catch {
      // Fail closed below if stored state/nonce cannot be read
    }

    if (oauthError) {
      this._authError.set(
        this.i18n?.t('auth.error.oauthFailed', { error: oauthError }) ??
          `Google sign-in failed: ${oauthError}`,
      );
      return;
    }

    const returnedState = params.get('state');
    if (!expectedState || !returnedState || returnedState !== expectedState) {
      this._authError.set(
        this.i18n?.t('auth.error.stateMismatch') ??
          'Google sign-in state mismatch. Please try again.',
      );
      return;
    }

    if (!expectedNonce) {
      this._authError.set(
        this.i18n?.t('auth.error.nonceMissing') ??
          'Google sign-in nonce missing. Please try again.',
      );
      return;
    }

    this.handleGoogleCredential(idToken!, expectedNonce);
  }

  handleGoogleCredential(credentialToken: string, expectedNonce?: string): boolean {
    try {
      const parts = credentialToken.split('.');
      if (parts.length < 2 || !parts[1]) {
        this._authError.set(
          this.i18n?.t('auth.error.invalidToken') ?? 'Invalid Google credential token.',
        );
        return false;
      }

      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const jsonPayload = decodeURIComponent(
        atob(paddedBase64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
      const payload = JSON.parse(jsonPayload) as GoogleJwtPayload;

      if (this.isExpired(payload.exp)) {
        this._authError.set(
          this.i18n?.t('auth.error.expiredToken') ??
            'Google credential token is expired or missing exp.',
        );
        return false;
      }

      if (expectedNonce !== undefined && payload.nonce !== expectedNonce) {
        this._authError.set(
          this.i18n?.t('auth.error.nonceMismatch') ??
            'Google sign-in nonce mismatch. Please try again.',
        );
        return false;
      }

      const user: UserProfile = {
        id: payload.sub || `google_${Date.now()}`,
        name:
          payload.name || payload.given_name || this.i18n?.t('auth.defaultUserName') || 'Google User',
        email: payload.email || '',
        avatarUrl: payload.picture,
        idToken: credentialToken,
        exp: payload.exp,
      };

      this._currentUser.set(user);
      this._isAdmin.set(false);
      this._authError.set(null);
      this.saveToStorage(user);
      queueMicrotask(() => this.verifyAdminStatus());
      return true;
    } catch (e) {
      console.warn('Failed to parse Google credential token:', e);
      this._authError.set(
        this.i18n?.t('auth.error.parseFailed') ?? 'Failed to parse Google credential token.',
      );
      return false;
    }
  }

  getIdToken(): string | null {
    const user = this._currentUser();
    if (!user?.idToken || this.isExpired(user.exp)) {
      if (user) {
        this.signOut();
      }
      return null;
    }
    return user.idToken;
  }

  verifyAdminStatus(): void {
    const token = this.getIdToken();
    if (!token || !this.http || !this.settings) {
      this._isAdmin.set(false);
      return;
    }

    let authMeUrl: string;
    try {
      const apiBase = this.settings.backendApiUrl();
      const base =
        typeof window !== 'undefined' && window.location?.origin
          ? new URL(apiBase, window.location.origin)
          : new URL(apiBase);
      authMeUrl = new URL('/api/v1/auth/me', base).toString();
    } catch {
      this._isAdmin.set(false);
      return;
    }

    this.http.get<AuthMeResponse>(authMeUrl).subscribe({
      next: (res) => {
        if (this._currentUser()?.idToken !== token) return;
        this._isAdmin.set(res?.isAdmin === true);
      },
      error: (err: unknown) => {
        if (this._currentUser()?.idToken !== token) return;
        if (err instanceof HttpErrorResponse && err.status === 401) {
          this.signOut();
          return;
        }
        this._isAdmin.set(false);
      },
    });
  }

  signOut(): void {
    this._currentUser.set(null);
    this._isAdmin.set(false);
    this._authError.set(null);
    this.saveToStorage(null);
  }

  private isExpired(exp?: number): boolean {
    return typeof exp !== 'number' || exp * 1000 <= Date.now();
  }

  private generateRandomHex(byteCount: number): string {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(byteCount);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    let out = '';
    for (let i = 0; i < byteCount * 2; i++) {
      out += Math.floor(Math.random() * 16).toString(16);
    }
    return out;
  }

  private loadFromStorage(): UserProfile | null {
    try {
      if (typeof localStorage === 'undefined' || !localStorage.getItem) {
        return null;
      }
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<UserProfile>;
      if (!parsed.idToken || this.isExpired(parsed.exp)) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
      }
      return parsed as UserProfile;
    } catch {
      return null;
    }
  }

  private saveToStorage(user: UserProfile | null): void {
    try {
      if (typeof localStorage === 'undefined' || !localStorage.setItem) {
        return;
      }
      if (user) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to persist auth state to localStorage:', e);
    }
  }
}
