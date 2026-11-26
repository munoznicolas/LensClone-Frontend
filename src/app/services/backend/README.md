# Backend Service Module

The `PriceApiService` connects the client-side OCR and price observation pipeline with the ASP.NET Core PostGIS spatial backend.

## Primary Files
- [price-api.service.ts](file:///C:/Users/Viajera/.gemini/antigravity/worktrees/LensClone-Frontend/admin_desktop_debugging_auth/src/app/services/backend/price-api.service.ts) - Angular `@Injectable()` managing REST API communication, spatial queries, price comparison requests, and authenticated submissions.
- [price-api.service.spec.ts](file:///C:/Users/Viajera/.gemini/antigravity/worktrees/LensClone-Frontend/admin_desktop_debugging_auth/src/app/services/backend/price-api.service.spec.ts) - Unit tests verifying guest comparison allowances, submission restrictions, and `401`/`403` handling.

## Endpoints & Permissions
- **Compare Price (`POST /api/v1/prices/compare`)**: Open to **both guests and authenticated users**. Queries regional prices within user-configured radius and time window to calculate real-time statistical ratings (Below Average, Average, Above Average).
- **Submit Price (`POST /api/v1/prices/submit`)**: Restricted to **authenticated users signed in with Google** (Bearer ID token attached by `authInterceptor`). Unauthenticated/guest submissions are blocked at the client service boundary, and HTTP `401`/`403` responses are not queued for offline sync.

## Offline Resilience
Failed submissions while offline are enqueued into IndexedDB (`offline_queue`) and synced automatically when the device regains network connectivity.
