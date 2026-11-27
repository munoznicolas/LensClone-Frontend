import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsComponent } from './settings.component';
import { I18nService, LANGUAGE_STORAGE_KEY } from '../../services/i18n/i18n.service';

describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let component: SettingsComponent;
  let i18n: I18nService;
  let localStore: Map<string, string>;

  beforeEach(async () => {
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

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
    }).compileComponents();

    i18n = TestBed.inject(I18nService);
    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture?.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should render auto, es-AR, and en-US options in inline mode and apply changes on save', async () => {
    fixture.componentRef.setInput('inline', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const select = el.querySelector('#inline-language') as HTMLSelectElement | null;
    expect(select).not.toBeNull();

    const optionValues = Array.from(select!.options).map((o) => o.value);
    expect(optionValues).toEqual(['auto', 'es-AR', 'en-US']);

    // Selecting es-AR should not apply until saveSettings() is called
    select!.value = 'es-AR';
    select!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.language).toBe('es-AR');
    expect(i18n.preference()).toBe('auto');

    // Clicking save commits the language change and updates rendered UI text
    const saveBtn = el.querySelector('.save-btn') as HTMLButtonElement;
    saveBtn.click();
    fixture.detectChanges();

    expect(i18n.preference()).toBe('es-AR');
    expect(i18n.activeLocale()).toBe('es-AR');
    expect(localStore.get(LANGUAGE_STORAGE_KEY)).toBe('es-AR');
    expect(el.querySelector('.settings-header h2')?.textContent).toContain(
      'Configuración del sistema CartLeaf',
    );
    expect(el.querySelector('.saved-badge')?.textContent).toContain('Preferencias guardadas');

    // Switch to en-US and save
    select!.value = 'en-US';
    select!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    saveBtn.click();
    fixture.detectChanges();

    expect(i18n.preference()).toBe('en-US');
    expect(i18n.activeLocale()).toBe('en-US');
    expect(el.querySelector('.settings-header h2')?.textContent).toContain(
      'CartLeaf System Settings',
    );
  });

  it('should discard unsaved language changes when closing the modal via Cancel', async () => {
    i18n.setPreference('en-US');
    fixture.componentRef.setInput('inline', false);
    fixture.detectChanges();

    component.openModal();
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const select = el.querySelector('#language') as HTMLSelectElement | null;
    expect(select).not.toBeNull();

    select!.value = 'es-AR';
    select!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.language).toBe('es-AR');
    expect(i18n.preference()).toBe('en-US');

    const cancelBtn = el.querySelector('.cancel-btn') as HTMLButtonElement;
    cancelBtn.click();
    fixture.detectChanges();

    expect(component.isOpen()).toBe(false);
    expect(i18n.preference()).toBe('en-US');

    // Reopening resets form value back to saved preference
    component.openModal();
    expect(component.language).toBe('en-US');
  });
});
