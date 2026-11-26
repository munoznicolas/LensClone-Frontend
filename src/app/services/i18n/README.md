# I18n Service

The `I18nService` provides Signal-based frontend localization supporting Argentinian Spanish (`es-AR`) and US English (`en-US`), with automatic browser-language detection and reactive switching.

## Primary Files

- [i18n.service.ts](file:///C:/Users/Viajera/.gemini/antigravity/worktrees/LensClone-Frontend/spanish_localization_settings/src/app/services/i18n/i18n.service.ts) - Root singleton service managing language preference, browser locale detection, `<html lang>` sync, translation lookup, and locale-aware number/time formatting.
- [translations.en-us.ts](file:///C:/Users/Viajera/.gemini/antigravity/worktrees/LensClone-Frontend/spanish_localization_settings/src/app/services/i18n/translations.en-us.ts) - Canonical `EN_US_TRANSLATIONS` dictionary and `TranslationKey` type.
- [translations.es-ar.ts](file:///C:/Users/Viajera/.gemini/antigravity/worktrees/LensClone-Frontend/spanish_localization_settings/src/app/services/i18n/translations.es-ar.ts) - `ES_AR_TRANSLATIONS` dictionary type-checked against `TranslationKey`.

## Key Signals & State Exposed

- `preference`: `Signal<'auto' | 'es-AR' | 'en-US'>` - Persisted user selection (`localStorage` key `lensclone_language_preference`), defaulting to `'auto'`.
- `navigatorLocale`: `Signal<'es-AR' | 'en-US'>` - Resolved browser locale updated on `window` `languagechange` events.
- `activeLocale`: `Signal<'es-AR' | 'en-US'>` - Effective locale used for translations, `Intl` formatting, and `document.documentElement.lang`.

## Locale Resolution Rules

- In `'auto'` mode, scans `navigator.languages` (or `[navigator.language]`): any `es*` tag resolves to `'es-AR'`, any `en*` tag resolves to `'en-US'`, and unmatched/unavailable environments fall back to `'es-AR'`.
- Calling `setPreference(pref)` throws an explicit `Error` on invalid values and updates `activeLocale` reactively.
