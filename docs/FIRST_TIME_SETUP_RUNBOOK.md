# First-Time Configuration Runbook (`LensClone-Frontend`)

First-time setup to connect `LensClone-Frontend` to the CloudFront backend and Auth0 tenant. For local install and dev commands (`npm install`, `npm start`), see [README.md](../README.md).

## 1. Parameters & Endpoints

| Parameter | Value |
| :--- | :--- |
| **Backend CloudFront URL** | `https://d10oghpahlcf95.cloudfront.net` |
| **`backendApiUrl`** (`settings.service.ts`) | `https://d10oghpahlcf95.cloudfront.net/api/v1/prices` *(no trailing `/`)* |
| **Auth0 Domain** | `dev-3zwfa1uzfu1emm6y.us.auth0.com` |
| **Auth0 Audience** | `lensclone-api` |
| **Auth0 Client ID** | `GujS4TJejHZqLJ4T7mIsNmUSWGrIT4Rc` |
| **Admin RBAC Permission** | `read:submissions` *(enabled on `LensClone API`, embedded in access tokens)* |
| **Allowed Local Origin** | `http://localhost:4200` *(preconfigured in Auth0 and AWS `FRONTEND_ORIGINS`)* |

| Endpoint | Auth |
| :--- | :--- |
| `POST /api/v1/prices/compare` | Public |
| `GET /api/v1/stores/heatmap?lat=&lon=&radiusKm=` | Public |
| `POST /api/v1/prices/submit` | `Authorization: Bearer <access_token>` (Auth0 `sub` = caller ID) |
| `GET /api/v1/prices/submissions?limit=50` | `Authorization: Bearer <access_token>` + `read:submissions` |

## 2. Configure the Backend API URL

1. `DEFAULT_SETTINGS.backendApiUrl` in `src/app/services/settings/settings.service.ts` defaults to the CloudFront URL above (can be overridden at runtime in the app's **Settings** UI).
2. Keep the `/api/v1/prices` suffix with **no trailing `/`**: `HeatmapService` resolves `${backendApiUrl}/../stores/heatmap`, which 404s if a trailing slash is present.
3. If you previously ran against `localhost:5000`, clear cached settings in DevTools (`localStorage.removeItem('lensclone_app_settings')`) and reload, or update the URL in Settings.

## 3. Configure Auth0

1. In **Auth0 → Applications → your Angular SPA (`GujS4TJejHZqLJ4T7mIsNmUSWGrIT4Rc`) → Settings**, confirm `http://localhost:4200` (no trailing `/`) is in **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins**.
2. Confirm admin users have the `read:submissions` permission on `LensClone API`.
3. **App wiring status**: `src/app/services/auth/auth.service.ts` currently uses a simulated Google sign-in and does not attach Bearer tokens. Public endpoints work immediately; wiring `@auth0/auth0-angular` (with the Domain, Client ID, Audience above, `httpInterceptor.allowedList` covering `/api/v1/prices/submit` and `/api/v1/prices/submissions*`, and an SSR-safe `redirect_uri` check because `provideClientHydration()` is enabled) is required before authenticated calls succeed.

## 4. Verify Locally

Run `npm install` and `npm start`, then smoke-test the public endpoints (use `curl.exe` in Windows PowerShell):

```bash
curl.exe "https://d10oghpahlcf95.cloudfront.net/api/v1/stores/heatmap?lat=-34.498361&lon=-58.497528&radiusKm=10"

curl.exe -X POST "https://d10oghpahlcf95.cloudfront.net/api/v1/prices/compare" -H "Content-Type: application/json" -d "{\"productName\":\"Milk 1L\",\"price\":1250,\"latitude\":-34.498361,\"longitude\":-58.497528,\"timeWindowDays\":14,\"radiusKm\":10,\"tolerancePercent\":5}"
```

## 5. Deploying to a Public Frontend URL (Cloudflare Workers Static Assets)

1. In **Cloudflare**, connect this GitHub repo with:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
   - **Environment variable**: `NODE_VERSION=22`
   - *(`wrangler.jsonc` points Cloudflare at `dist/lens-clone/browser` with SPA routing; `public/_headers` sets ONNX/WASM caching and `COOP`/`COEP`; `angular.json` excludes `ort-wasm-simd-threaded.jsep.*` to stay under Cloudflare's 25 MiB per-file limit.)*
2. Add the deployed origin (e.g. `https://lensclone-frontend.<subdomain>.workers.dev`, **no trailing `/`**) to Auth0's **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins**.
3. Add the same origin (no trailing `/`) to the backend repo GitHub Actions Variable `FRONTEND_ORIGINS` and re-run the backend deploy workflow.

## Troubleshooting

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| Requests still hit `localhost:5000` | Cached `localStorage` settings | Run `localStorage.removeItem('lensclone_app_settings')` and reload |
| `/stores/heatmap` returns `404` | Trailing `/` on `backendApiUrl` | Remove trailing `/` from `backendApiUrl` |
| `/submit` shows "Saved offline" instead of an error | `PriceApiService.submitPrice()` catches all HTTP errors (including `401`/CORS) into IndexedDB `offline_queue` | Inspect the actual status code in DevTools **Network** tab |
| Browser CORS error | Origin missing from `FRONTEND_ORIGINS` or has trailing `/` | Add exact origin without `/` to `FRONTEND_ORIGINS` and re-run backend deploy |
| `401` on `/submit` or `403` on `/submissions` | Missing Bearer token, wrong `audience`, or missing `read:submissions` | Verify `audience: 'lensclone-api'`, interceptor `allowedList`, and Auth0 RBAC permission |
