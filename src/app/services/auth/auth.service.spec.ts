import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let mockStore: Map<string, string>;

  beforeEach(() => {
    mockStore = new Map<string, string>();
    const localStorageMock = {
      getItem: (key: string) => mockStore.get(key) ?? null,
      setItem: (key: string, value: string) => mockStore.set(key, value),
      removeItem: (key: string) => mockStore.delete(key),
      clear: () => mockStore.clear(),
      length: 0,
      key: () => null,
    };
    vi.stubGlobal('localStorage', localStorageMock);
    service = new AuthService();
  });

  it('should initialize as anonymous (null user)', () => {
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should sign in user with Google profile', () => {
    service.signInWithGoogle();

    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()).not.toBeNull();
    expect(service.currentUser()?.email).toBe('alex.rivera@gmail.com');
  });

  it('should sign in user with custom Google profile', () => {
    service.signInWithGoogle({
      id: 'custom_123',
      name: 'Maria Gomez',
      email: 'maria@example.com',
      avatarUrl: 'https://example.com/avatar.jpg',
    });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.name).toBe('Maria Gomez');
    expect(service.currentUser()?.email).toBe('maria@example.com');
  });

  it('should parse and set user from Google GIS credential token', () => {
    const payload = {
      sub: 'google_sub_999',
      name: 'Taylor Swift',
      email: 'taylor@google.com',
      picture: 'https://example.com/taylor.jpg',
    };
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify(payload));
    const token = `${header}.${body}.mockSignature`;

    service.handleGoogleCredential(token);

    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.id).toBe('google_sub_999');
    expect(service.currentUser()?.name).toBe('Taylor Swift');
    expect(service.currentUser()?.email).toBe('taylor@google.com');
    expect(service.currentUser()?.avatarUrl).toBe('https://example.com/taylor.jpg');
    expect(service.currentUser()?.idToken).toBe(token);
  });

  it('should sign out user back to anonymous state', () => {
    service.signInWithGoogle();
    expect(service.isAuthenticated()).toBe(true);

    service.signOut();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });
});
