# Settings Feature Component

The `SettingsComponent` renders user configuration controls either inline (desktop Preferences tab) or inside a modal dialog triggered from the mobile Lens header.

## Primary Files

- [settings.component.ts](file:///C:/Users/Viajera/.gemini/antigravity/worktrees/LensClone-Frontend/spanish_localization_settings/src/app/features/settings/settings.component.ts) - Form bindings and save/cancel lifecycle for language, location accuracy, price comparison window/radius/tolerance, and admin API base URL.
- [settings.component.html](file:///C:/Users/Viajera/.gemini/antigravity/worktrees/LensClone-Frontend/spanish_localization_settings/src/app/features/settings/settings.component.html) - Inline and modal UI templates.

## Language Selection

- Allows selecting between `auto` (browser navigator detection), `es-AR` (Spanish - Argentina), and `en-US` (English - US).
- Language changes are committed through `I18nService.setPreference(...)` when clicking **Save Preferences**; closing or canceling the modal discards unsaved language changes.
