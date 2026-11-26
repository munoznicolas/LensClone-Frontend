import { Injectable, OnDestroy, computed, effect, signal } from '@angular/core';
import { EN_US_TRANSLATIONS, TranslationKey } from './translations.en-us';
import { ES_AR_TRANSLATIONS } from './translations.es-ar';

export type SupportedLocale = 'es-AR' | 'en-US';
export type LanguagePreference = 'auto' | SupportedLocale;

export const LANGUAGE_STORAGE_KEY = 'lensclone_language_preference';

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || value === 'es-AR' || value === 'en-US';
}

export function resolveNavigatorLocale(
  languages?: readonly string[] | null,
  language?: string | null,
): SupportedLocale {
  const candidates = languages && languages.length > 0 ? languages : language ? [language] : [];
  for (const rawTag of candidates) {
    if (typeof rawTag !== 'string') continue;
    const tag = rawTag.trim().toLowerCase();
    if (!tag) continue;
    if (tag === 'es' || tag.startsWith('es-')) {
      return 'es-AR';
    }
    if (tag === 'en' || tag.startsWith('en-')) {
      return 'en-US';
    }
  }
  return 'es-AR';
}

@Injectable({
  providedIn: 'root',
})
export class I18nService implements OnDestroy {
  private readonly _preference = signal<LanguagePreference>(this.loadPreference());
  private readonly _navigatorLocale = signal<SupportedLocale>(this.detectNavigatorLocale());

  readonly preference = this._preference.asReadonly();
  readonly navigatorLocale = this._navigatorLocale.asReadonly();
  readonly activeLocale = computed<SupportedLocale>(() => {
    const pref = this._preference();
    return pref === 'auto' ? this._navigatorLocale() : pref;
  });

  private readonly onLanguageChange = (): void => {
    this._navigatorLocale.set(this.detectNavigatorLocale());
  };

  constructor() {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('languagechange', this.onLanguageChange);
    }

    effect(() => {
      const locale = this.activeLocale();
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = locale;
      }
    });
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('languagechange', this.onLanguageChange);
    }
  }

  setPreference(pref: LanguagePreference): void {
    if (!isLanguagePreference(pref)) {
      throw new Error(`Invalid language preference: ${String(pref)}`);
    }
    this._preference.set(pref);
    this.savePreference(pref);
  }

  t(key: TranslationKey, params?: Record<string, string | number>): string {
    const dict = this.activeLocale() === 'es-AR' ? ES_AR_TRANSLATIONS : EN_US_TRANSLATIONS;
    const template = dict[key];
    if (!params) {
      return template;
    }
    return template.replace(/\{(\w+)\}/g, (match, paramName: string) =>
      Object.prototype.hasOwnProperty.call(params, paramName) ? String(params[paramName]) : match,
    );
  }

  formatNumber(value: number, fractionDigits = 2): string {
    return new Intl.NumberFormat(this.activeLocale(), {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  }

  formatTime(value: string | Date): string {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat(this.activeLocale(), {
      timeStyle: 'short',
    }).format(date);
  }

  private detectNavigatorLocale(): SupportedLocale {
    if (typeof navigator === 'undefined') {
      return 'es-AR';
    }
    return resolveNavigatorLocale(navigator.languages, navigator.language);
  }

  private loadPreference(): LanguagePreference {
    try {
      if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
        return 'auto';
      }
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return isLanguagePreference(stored) ? stored : 'auto';
    } catch {
      return 'auto';
    }
  }

  private savePreference(pref: LanguagePreference): void {
    try {
      if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') {
        return;
      }
      localStorage.setItem(LANGUAGE_STORAGE_KEY, pref);
    } catch {
      // Ignore storage write errors
    }
  }
}
