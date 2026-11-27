# Workspace Rules for AI Agents (PoC-LensClone)

You are operating on the **LensClone Frontend** repository (`PoC-LensClone`). Always adhere strictly to the following workspace rules:

## 1. Angular 22 & TypeScript Guidelines
- All Angular components MUST be standalone (`standalone: true`).
- Use Angular Signals (`signal()`, `computed()`) for reactive state management.
- Use native Angular control flow (`@if`, `@else`, `@for`, `@switch`). Structural directives (`*ngIf`, `*ngFor`) are strictly forbidden.
- Maintain strict typing (`strict: true`). Avoid `any` under all circumstances.

## 2. Machine Learning & Canvas Rules
- Canvas 2d contexts reading pixel data via `getImageData()` MUST be initialized with `{ willReadFrequently: true }`.
- ONNX WASM model path references MUST point to `/assets/ort/`.
- `requestAnimationFrame` loops in camera and vision services MUST have `detectionInProgress` flags and clean `cancelAnimationFrame` teardowns.

## 3. Code Aesthetics & Documentation
- Follow styling rules in `CODESTYLE.md` (curated palettes, glassmorphism, responsive dynamic layouts, accessibility attributes).
- Never introduce new hardcoded color literals (`#hex`, `rgb()`, `rgba()`, `hsl()`) outside `src/styles.css`; use CSS custom properties (`var(--color-*)`) instead.
- Keep co-located `README.md` files updated whenever modifying feature components (`src/app/features/*/`) or core services (`src/app/services/*/`).

## 4. Mandatory Verification
- ALWAYS run `ng test` and `ng build` after making changes to verify that unit tests pass and compilation succeeds.
