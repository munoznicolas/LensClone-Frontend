import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  I18nService,
  LANGUAGE_STORAGE_KEY,
  LanguagePreference,
  resolveNavigatorLocale,
} from './i18n.service';
import { EN_US_TRANSLATIONS } from './translations.en-us';
import { ES_AR_TRANSLATIONS } from './translations.es-ar';

describe('I18nService', () => {
  let localStore: Map<string, string>;

  beforeEach(() => {
    localStore = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStore.get(key) ?? null,
      setItem: (key: string, value: string) => localStore.set(key, value),
      removeItem: (key: string) => localStore.delete(key),
      clear: () => localStore.clear(),
      length: 0,
      key: () => null,
    });
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('resolveNavigatorLocale', () => {
    it('should resolve Spanish tags to es-AR and English tags to en-US', () => {
      expect(resolveNavigatorLocale(['es-AR', 'en-US'])).toBe('es-AR');
      expect(resolveNavigatorLocale(['es-419'])).toBe('es-AR');
      expect(resolveNavigatorLocale(['es'])).toBe('es-AR');
      expect(resolveNavigatorLocale(['en-US'])).toBe('en-US');
      expect(resolveNavigatorLocale(['en-GB', 'es-AR'])).toBe('en-US');
      expect(resolveNavigatorLocale(['pt-BR', 'es-UY'])).toBe('es-AR');
      expect(resolveNavigatorLocale(undefined, 'en-US')).toBe('en-US');
    });

    it('should fall back to es-AR for unsupported or missing navigator languages', () => {
      expect(resolveNavigatorLocale(['pt-BR'])).toBe('es-AR');
      expect(resolveNavigatorLocale([])).toBe('es-AR');
      expect(resolveNavigatorLocale(null, null)).toBe('es-AR');
    });
  });

  it('should persist valid language preferences and reject invalid values', () => {
    TestBed.configureTestingModule({ providers: [I18nService] });
    const service = TestBed.inject(I18nService);

    service.setPreference('es-AR');
    expect(service.preference()).toBe('es-AR');
    expect(service.activeLocale()).toBe('es-AR');
    expect(localStore.get(LANGUAGE_STORAGE_KEY)).toBe('es-AR');
    TestBed.flushEffects();
    expect(document.documentElement.lang).toBe('es-AR');

    service.setPreference('en-US');
    expect(service.preference()).toBe('en-US');
    expect(service.activeLocale()).toBe('en-US');
    expect(localStore.get(LANGUAGE_STORAGE_KEY)).toBe('en-US');
    TestBed.flushEffects();
    expect(document.documentElement.lang).toBe('en-US');

    service.setPreference('auto');
    expect(service.preference()).toBe('auto');
    expect(localStore.get(LANGUAGE_STORAGE_KEY)).toBe('auto');

    expect(() => service.setPreference('fr-FR' as LanguagePreference)).toThrowError(
      /Invalid language preference/,
    );
  });

  it('should fall back to auto when localStorage holds corrupted preference data', () => {
    localStore.set(LANGUAGE_STORAGE_KEY, 'pt-BR');
    TestBed.configureTestingModule({ providers: [I18nService] });
    const service = TestBed.inject(I18nService);

    expect(service.preference()).toBe('auto');
  });

  it('should update activeLocale on window languagechange only when in auto mode', () => {
    const originalNavigator = window.navigator;
    vi.stubGlobal('navigator', {
      ...originalNavigator,
      languages: ['en-US'],
      language: 'en-US',
    });

    TestBed.configureTestingModule({ providers: [I18nService] });
    const service = TestBed.inject(I18nService);
    expect(service.activeLocale()).toBe('en-US');

    vi.stubGlobal('navigator', {
      ...originalNavigator,
      languages: ['es-AR'],
      language: 'es-AR',
    });
    window.dispatchEvent(new Event('languagechange'));
    expect(service.navigatorLocale()).toBe('es-AR');
    expect(service.activeLocale()).toBe('es-AR');

    service.setPreference('en-US');
    vi.stubGlobal('navigator', {
      ...originalNavigator,
      languages: ['es-UY'],
      language: 'es-UY',
    });
    window.dispatchEvent(new Event('languagechange'));
    expect(service.navigatorLocale()).toBe('es-AR');
    expect(service.activeLocale()).toBe('en-US');
  });

  it('should interpolate parameters and keep en-US and es-AR dictionary keys identical', () => {
    TestBed.configureTestingModule({ providers: [I18nService] });
    const service = TestBed.inject(I18nService);

    service.setPreference('es-AR');
    expect(service.t('settings.searchRadius.label', { radius: 15 })).toBe(
      'Radio geográfico (km): 15 km',
    );
    expect(service.t('lens.historyModal.detectedCount', { count: 0 })).toBe('0 detectados');

    service.setPreference('en-US');
    expect(service.t('settings.searchRadius.label', { radius: 15 })).toBe(
      'Geographic Radius (Km): 15 km',
    );

    const enKeys = Object.keys(EN_US_TRANSLATIONS).sort();
    const esKeys = Object.keys(ES_AR_TRANSLATIONS).sort();
    expect(esKeys).toEqual(enKeys);

    for (const key of enKeys) {
      expect(
        EN_US_TRANSLATIONS[key as keyof typeof EN_US_TRANSLATIONS].trim().length,
      ).toBeGreaterThan(0);
      expect(
        ES_AR_TRANSLATIONS[key as keyof typeof ES_AR_TRANSLATIONS].trim().length,
      ).toBeGreaterThan(0);
    }
  });

  it('should format numbers and times safely', () => {
    TestBed.configureTestingModule({ providers: [I18nService] });
    const service = TestBed.inject(I18nService);

    service.setPreference('es-AR');
    expect(service.formatNumber(1250.5, 2)).toBe('1.250,50');
    expect(service.formatTime('invalid-date')).toBe('');
    expect(service.formatTime('2026-11-26T15:30:00Z').length).toBeGreaterThan(0);

    service.setPreference('en-US');
    expect(service.formatNumber(1250.5, 2)).toBe('1,250.50');
  });
});
