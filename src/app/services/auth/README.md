# Auth Service

The `AuthService` manages Google OIDC user session state, redirect callback validation, backend-verified admin authorization, and `Authorization: Bearer` header injection.

## Primary Files
- [auth.service.ts](file:///C:/Users/Viajera/.gemini/antigravity/worktrees/LensClone-Frontend/admin_desktop_debugging_auth/src/app/services/auth/auth.service.ts) - Angular `@Injectable()` managing Google OIDC top-level redirect login (`response_type=id_token` with `state` & `nonce`), token expiry validation, and `GET /api/v1/auth/me` admin verification.
- [auth.interceptor.ts](file:///C:/Users/Viajera/.gemini/antigravity/worktrees/LensClone-Frontend/admin_desktop_debugging_auth/src/app/services/auth/auth.interceptor.ts) - Functional HTTP interceptor attaching Bearer ID tokens strictly to requests targeting the configured backend API origin and signing out on `401`.

## Key Signals & State Exposed
- `currentUser`: `Signal<UserProfile | null>` - Computed signal returning the authenticated Google user profile.
- `isAuthenticated`: `Signal<boolean>` - Computed signal checking if a session is active.
- `isAdmin`: `Signal<boolean>` - Read-only signal populated strictly from `GET /api/v1/auth/me` (never persisted in `localStorage`).
- `authError`: `Signal<string | null>` - Read-only signal surfacing configuration or OAuth callback errors.

## Key Methods
- `signInWithGoogle(navigate?, clientId?)`: Persists CSRF `state` and replay `nonce` to `sessionStorage` and redirects to Google's OIDC authorization endpoint (COOP-compatible).
- `handleOAuthRedirectCallback()`: Validates `#id_token` + `state` + `nonce`, strips the URL hash via `history.replaceState`, and initiates session + `/api/v1/auth/me` verification.
- `getIdToken()`: Returns the active Google ID token if unexpired, otherwise signs out.
- `verifyAdminStatus()`: Queries `/api/v1/auth/me` on the backend to update `isAdmin`.
- `signOut()`: Clears user, admin status, error state, and `localStorage`.

## Persistence & Access Control
- Auth state is persisted to `localStorage` under key `lens_clone_auth_v1` and discarded if `idToken` is missing or `exp` has elapsed.
- Unauthenticated (guest) users can compare prices and use public dashboard views.
- Authenticated Google users can submit price observations.
- Backend-verified admin users (`isAdmin() === true`) gain access to desktop debugging (`Diagnostics` tab and Backend API Base URL setting).
- `GOOGLE_CLIENT_ID` is injected at build/serve time by `scripts/ng-with-env.js` from `process.env.CLIENT_ID` (CI/Cloudflare) or gitignored `.env.local` via Angular's `--define __GOOGLE_CLIENT_ID__`.
