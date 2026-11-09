# Auth Service

The `AuthService` manages user session state, local authentication persistence, and user profile metadata for the application.

## Primary Files
- [auth.service.ts](file:///C:/Users/Viajera/.gemini/antigravity/worktrees/LensClone-Frontend/ocr_price_comparison_backend/src/app/services/auth/auth.service.ts) - Angular `@Injectable()` providing reactive signals for user auth state, Google Identity Services (GIS) credential parsing, and local storage persistence.

## Key Signals & State Exposed
- `currentUser`: `Signal<UserProfile | null>` - Computed signal returning the currently authenticated user profile.
- `isAuthenticated`: `Signal<boolean>` - Computed signal checking if a valid user session is active.

## Key Methods
- `signInWithGoogle(customUser?: UserProfile)`: Simulates Google OAuth sign-in and persists user session.
- `handleGoogleCredential(credentialToken: string)`: Parses Google GIS JWT token payload and activates authenticated user session.
- `signOut()`: Clears active user session and removes local storage data.

## Persistence & Access Control
- Auth state is persisted to `localStorage` under key `lens_clone_auth_v1`.
- Unauthenticated (guest) users are permitted to perform real-time price comparisons.
- Authenticated users with valid Google profiles are permitted to submit new price observations to the database.
