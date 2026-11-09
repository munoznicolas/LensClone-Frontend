import { Injectable, signal, computed } from '@angular/core';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  idToken?: string;
}

const AUTH_STORAGE_KEY = 'lens_clone_auth_v1';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly _currentUser = signal<UserProfile | null>(this.loadFromStorage());

  readonly currentUser = computed(() => this._currentUser());
  readonly isAuthenticated = computed(() => this._currentUser() !== null);

  signInWithGoogle(customUser?: UserProfile): void {
    const user: UserProfile = customUser || {
      id: 'google_demo_101',
      name: 'Alex Rivera',
      email: 'alex.rivera@gmail.com',
      avatarUrl:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
    };
    this._currentUser.set(user);
    this.saveToStorage(user);
  }

  handleGoogleCredential(credentialToken: string): void {
    try {
      const parts = credentialToken.split('.');
      if (parts.length < 2) return;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
      const payload = JSON.parse(jsonPayload) as {
        sub?: string;
        name?: string;
        given_name?: string;
        email?: string;
        picture?: string;
      };

      const user: UserProfile = {
        id: payload.sub || `google_${Date.now()}`,
        name: payload.name || payload.given_name || 'Google User',
        email: payload.email || '',
        avatarUrl: payload.picture,
        idToken: credentialToken,
      };

      this._currentUser.set(user);
      this.saveToStorage(user);
    } catch (e) {
      console.warn('Failed to parse Google credential token:', e);
    }
  }

  signOut(): void {
    this._currentUser.set(null);
    this.saveToStorage(null);
  }

  private loadFromStorage(): UserProfile | null {
    try {
      if (typeof localStorage === 'undefined' || !localStorage.getItem) {
        return null;
      }
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as UserProfile;
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
