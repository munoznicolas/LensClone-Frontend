# Developer Setup & Deployment Runbook

End-to-end steps to configure Google OAuth, run both `LensClone-Backend` and `LensClone-Frontend` locally, deploy both to production, and verify admin-only desktop debugging. For project commands and architecture overview, see [README.md](../README.md).

## Reference Parameters & Endpoints

| Parameter | Value |
| :--- | :--- |
| **Backend CloudFront URL** | `https://d10oghpahlcf95.cloudfront.net` |
| **`backendApiUrl`** (`settings.service.ts`) | `https://d10oghpahlcf95.cloudfront.net/api/v1/prices` *(no trailing `/`)* |
| **Local Backend URL** (`launchSettings.json`) | `http://localhost:5278` *(API base `http://localhost:5278/api/v1/prices`)* |
| **Frontend Google Client ID** | `CLIENT_ID` env var / `.env.local` (injected into `GOOGLE_CLIENT_ID` at build/serve time) |
| **Backend Google Client ID** | `Authentication:Google:ClientId` (CI secret `CLIENT_ID`) |
| **Backend Admin Allowlist** | `Authentication:Google:AdminEmails` (CI secret `ADMIN_EMAILS`) |
| **Allowed Local Origin** | `http://localhost:4200` |

| Endpoint | Access |
| :--- | :--- |
| `POST /api/v1/prices/compare` | Public |
| `GET /api/v1/stores/heatmap?lat=&lon=&radiusKm=` | Public |
| `GET /api/v1/auth/me` | `Authorization: Bearer <google_id_token>` |
| `POST /api/v1/prices/submit` | `Authorization: Bearer <google_id_token>` (Google `sub` = caller ID) |
| `GET /api/v1/prices/submissions?limit=50` | `Authorization: Bearer <google_id_token>` + `AdminOnly` |
| `/api/v1/dev/*` *(Development only)* | `Authorization: Bearer <google_id_token>` + `AdminOnly` (`404` outside Development) |

---

## 1. Google Cloud Console — Create OAuth 2.0 Web Client

1. Open **Google Cloud Console → APIs & Services → OAuth consent screen**:
   - Choose **External** user type and fill in app name/support/developer email.
   - Add scopes: `openid`, `email`, and `profile`.
   - If leaving publishing status in **Testing**, add all test Google accounts (at least one admin account and one non-admin account) under **Test users**.
2. Open **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application** (no Client Secret is needed).
   - Under **Authorized JavaScript origins**, add `http://localhost:4200` (and later your Cloudflare Workers URL, **no trailing `/`**).
   - Under **Authorized redirect URIs**, add `http://localhost:4200` (and later your Cloudflare Workers URL, **no trailing `/`**).
3. Copy the generated Client ID (`<id>.apps.googleusercontent.com`).

---

## 2. Configure Local Secrets in Both Repositories

1. **Frontend** (gitignored `.env.local` in `LensClone-Frontend` root):
   ```ini
   CLIENT_ID=<YOUR_CLIENT_ID>.apps.googleusercontent.com
   ```
   - `scripts/ng-with-env.js` reads `CLIENT_ID` from the process environment or `.env.local` and passes `--define __GOOGLE_CLIENT_ID__=...` to `ng serve` / `ng build`, so the Client ID stays out of git.
   - *(Leave `DEFAULT_SETTINGS.backendApiUrl` in `src/app/services/settings/settings.service.ts` pointing at CloudFront unless your CloudFront domain changes.)*
2. **Backend (local dev only)**:
   - Create gitignored `LensClone.Api/appsettings.Development.json` inside `C:/repos/LensClone-Backend`:
     ```json
     {
       "Storage": { "Provider": "InMemory" },
       "Authentication": {
         "Google": {
           "ClientId": "<YOUR_CLIENT_ID>.apps.googleusercontent.com",
           "AdminEmails": ["you@gmail.com"]
         }
       }
     }
     ```
   - To test against DynamoDB Local instead of `InMemory`, run `docker compose -f infrastructure/docker-compose.yml up -d` and set `"Storage": { "Provider": "DynamoDb" }` with `"DynamoDb": { "ServiceUrl": "http://localhost:8000" }`.

---

## 3. Run & Verify Locally

1. **Start Backend** (`C:/repos/LensClone-Backend`):
   ```powershell
   dotnet run --project LensClone.Api
   ```
   - Runs in `Development` mode at `http://localhost:5278` (per `LensClone.Api/Properties/launchSettings.json`).
2. **Start Frontend** (`LensClone-Frontend`):
   ```powershell
   npm install
   npm start
   ```
   - Runs at `http://localhost:4200` with `CLIENT_ID` injected from `.env.local` (or `$env:CLIENT_ID`).
3. **Point local browser to local backend** *(optional—skip if testing against deployed CloudFront)*:
   - Because **Backend API Base URL** in Settings is hidden for non-admins, override `backendApiUrl` in DevTools Console before signing in and reload:
     ```javascript
     localStorage.setItem('lensclone_app_settings', JSON.stringify({
       timeWindowDays: 14,
       radiusKm: 10,
       tolerancePercent: 5,
       backendApiUrl: 'http://localhost:5278/api/v1/prices',
     }));
     ```
   - To switch back to CloudFront later, run `localStorage.removeItem('lensclone_app_settings')` and reload.
4. **Smoke-test public endpoints** (Windows PowerShell):
   ```powershell
   curl.exe "http://localhost:5278/api/v1/stores/heatmap?lat=-34.498361&lon=-58.497528&radiusKm=10"
   curl.exe -X POST "http://localhost:5278/api/v1/prices/compare" -H "Content-Type: application/json" -d "{\"productName\":\"Milk 1L\",\"price\":1250,\"latitude\":-34.498361,\"longitude\":-58.497528,\"timeWindowDays\":14,\"radiusKm\":10,\"tolerancePercent\":5}"
   ```

---

## 4. Configure & Deploy Backend (`LensClone-Backend` → AWS Lambda + CloudFront)

1. In the `LensClone-Backend` GitHub repository (**Settings → Secrets and variables → Actions**):
   - **Repository secrets**:
     - `CLIENT_ID`: `<YOUR_CLIENT_ID>.apps.googleusercontent.com` *(already configured)*
     - `ADMIN_EMAILS`: JSON array of verified Google emails granted `AdminOnly`, e.g. `["you@gmail.com"]`
     - Required infra secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`
   - **Repository variables**:
     - `FRONTEND_ORIGINS`: JSON array of allowed origins without trailing `/`, e.g. `["http://localhost:4200","https://lensclone-frontend.<subdomain>.workers.dev"]`
     - Optional overrides (defaults shown): `AWS_REGION` (`us-east-1`), `ENVIRONMENT` (`production`), `R2_BUCKET` (`lensclone-tfstate`)
   - **Clean up obsolete Auth0 settings**: remove `JWT_AUTHORITY` secret, `JWT_AUDIENCE` variable, and any unused `GOOGLE_CLIENT_ID` variable if present.
2. Commit and merge branch `admin_desktop_debugging_auth` into `main` on `LensClone-Backend`.
   - Pushing to `main` triggers `.github/workflows/deploy.yml` (**Deploy Backend to AWS**), which runs `dotnet test --configuration Release`, publishes the `linux-arm64` Lambda ZIP, and runs `terraform apply` using `secrets.CLIENT_ID`.
3. Check the workflow job summary **CloudFront API URL** and confirm it matches `DEFAULT_SETTINGS.backendApiUrl` in `src/app/services/settings/settings.service.ts` (with `/api/v1/prices` and no trailing `/`).

---

## 5. Deploy Frontend (`LensClone-Frontend` → Cloudflare Workers Static Assets)

1. Ensure GitHub repository secret `CLIENT_ID` is set in `LensClone-Frontend` (already configured; used by `.github/workflows/ci.yml`), and merge branch `admin_desktop_debugging_auth` into `main`.
2. In **Cloudflare**, connect the `LensClone-Frontend` repository with:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
   - **Build environment variables / secrets** (**Settings → Build → Variables and secrets**):
     - `NODE_VERSION=22`
     - `CLIENT_ID=<YOUR_CLIENT_ID>.apps.googleusercontent.com`
   > [!IMPORTANT]
   > Cloudflare's Git integration runs `npm run build` inside Cloudflare and does **not** read GitHub Actions repository secrets (`secrets.CLIENT_ID`). You must set `CLIENT_ID` in Cloudflare Workers Build **Variables and secrets** (unless you deploy via GitHub Actions instead), otherwise `GOOGLE_CLIENT_ID` falls back to its placeholder and sign-in shows `"Google OAuth Client ID is not configured."`.
   - *(`wrangler.jsonc` serves `dist/lens-clone/browser` as an SPA; `public/_headers` sets `COOP: same-origin`, `COEP: credentialless`, and asset caching; `angular.json` excludes `ort-wasm-simd-threaded.jsep.*` to stay under Cloudflare's 25 MiB file cap.)*
3. Copy your deployed origin (`https://lensclone-frontend.<subdomain>.workers.dev`, **no trailing `/`**) and:
   1. Add it to Google Cloud Console **Authorized JavaScript origins** and **Authorized redirect URIs**.
   2. Add it to `LensClone-Backend` GitHub variable `FRONTEND_ORIGINS` and re-run **Deploy Backend to AWS**.

---

## 6. End-to-End Verification Checklist

1. **Guest (signed-out) user**:
   - Desktop view loads **Analytics & Heatmap**, **Shopping Budget**, and **Preferences** normally.
   - **Diagnostics** tab and **Backend API Base URL** setting are hidden.
   - Mobile/Lens overflow menu has no **Debug Diagnostics** option.
2. **Non-admin Google user**:
   - Clicking **Sign In** redirects to Google and returns cleanly (URL `#id_token=...` hash stripped immediately, no COOP popup error).
   - DevTools **Network** shows `GET /api/v1/auth/me` returning `200` with `{ "isAdmin": false }`.
   - **Diagnostics** tab and **Backend API Base URL** remain hidden.
   - Price submission (`POST /api/v1/prices/submit`) sends `Authorization: Bearer <id_token>` and succeeds.
   - Direct calls to `GET /api/v1/prices/submissions` (and `/api/v1/dev/*` in Development) return `403 Forbidden`.
3. **Admin Google user** (email in `ADMIN_EMAILS`):
   - `GET /api/v1/auth/me` returns `200` with `{ "isAdmin": true }`.
   - **Diagnostics** tab (`DebugComponent`) and **Backend API Base URL** in Settings appear and work.
   - Signing out while viewing **Diagnostics** immediately switches back to **Analytics & Heatmap** and tears down `DebugComponent`.
   - In Production, `/api/v1/dev/*` returns `404` even for admins.

---

## Troubleshooting

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| `"Google OAuth Client ID is not configured."` | `CLIENT_ID` missing during `npm start` / `npm run build` | Add `CLIENT_ID=...` to `.env.local` locally or Cloudflare Workers Build **Variables and secrets** |
| Requests hit wrong backend URL | Cached `localStorage` override | Run `localStorage.removeItem('lensclone_app_settings')` and reload |
| `/stores/heatmap` returns `404` | Trailing `/` on `backendApiUrl` | Remove trailing `/` from `backendApiUrl` |
| `Error 400: redirect_uri_mismatch` on Google login | App origin missing in Google Cloud Console | Add exact origin without trailing `/` to **Authorized redirect URIs** & **Authorized JavaScript origins** |
| Browser CORS error | Origin missing from `FRONTEND_ORIGINS` or has trailing `/` | Update `FRONTEND_ORIGINS` in `LensClone-Backend` and re-run **Deploy Backend to AWS** |
| `401` on `/auth/me` or `/submit` | Expired token (>1h) or frontend/backend `ClientId` mismatch | Sign in again with Google and verify both `CLIENT_ID` values match |
| **Diagnostics** tab missing for admin email | Email missing from `ADMIN_EMAILS` or `email_verified` not `true` | Add verified Google email to `ADMIN_EMAILS` (or `appsettings.Development.json`) and redeploy/restart backend |
