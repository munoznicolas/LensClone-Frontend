import { test, expect, Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AuditFinding,
  captureAnnotatedScreenshot,
  runDomAudit,
  waitForFontsAndPaint,
} from './mobile-ui-audit.helpers';

const AUDIT_DIR = path.resolve(process.cwd(), 'test-results/mobile-ui-audit');
const SHOTS_DIR = path.join(AUDIT_DIR, 'screenshots');

function createFakeJwt(expOffsetSeconds = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'audit_user_1',
      name: 'María Fernanda Rodríguez',
      email: 'maria.rodriguez.verylongemail@example.com',
      exp: Math.floor(Date.now() / 1000) + expOffsetSeconds,
    }),
  ).toString('base64url');
  return `${header}.${payload}.mock`;
}

async function setupMobileEnvironment(
  page: Page,
  options: {
    locale: 'es-AR' | 'en-US';
    torchSupported?: boolean;
    withHistory?: boolean;
    signedIn?: boolean;
    isAdmin?: boolean;
    emptyShoppingList?: boolean;
  },
): Promise<void> {
  const token = options.signedIn ? createFakeJwt() : null;

  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: options.signedIn ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify(
        options.signedIn
          ? {
              userId: 'audit_user_1',
              email: 'maria.rodriguez.verylongemail@example.com',
              name: 'María Fernanda Rodríguez',
              isAdmin: Boolean(options.isAdmin),
            }
          : { error: 'Unauthorized' },
      ),
    });
  });

  await page.addInitScript((opts) => {
    localStorage.clear();
    localStorage.setItem('lensclone_language_preference', opts.locale);

    if (opts.emptyShoppingList) {
      localStorage.setItem('lensclone_shopping_list_v1', JSON.stringify([]));
    } else {
      localStorage.setItem(
        'lensclone_shopping_list_v1',
        JSON.stringify([
          {
            id: 'item_1',
            name: 'Leche entera orgánica La Serenísima 1L',
            quantity: 2,
            estimatedUnitPrice: 1850.5,
          },
          {
            id: 'item_2',
            name: 'Yerba mate suave Playadito 1kg',
            quantity: 1,
            estimatedUnitPrice: 4200,
          },
        ]),
      );
    }

    if (opts.withHistory) {
      const tinyImg =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
      localStorage.setItem(
        'lens_clone_history_v1',
        JSON.stringify([
          {
            id: 'cap_1',
            timestamp: '2026-11-27T12:00:00.000Z',
            dataUrl: tinyImg,
            detectionsCount: 4,
            textSnippet: 'LECHE 1L $1850',
          },
          {
            id: 'cap_2',
            timestamp: '2026-11-27T11:30:00.000Z',
            dataUrl: tinyImg,
            detectionsCount: 2,
            textSnippet: 'CAFE 250G $7500',
          },
        ]),
      );
    }

    if (opts.token) {
      localStorage.setItem(
        'lens_clone_auth_v1',
        JSON.stringify({
          id: 'audit_user_1',
          name: 'María Fernanda Rodríguez',
          email: 'maria.rodriguez.verylongemail@example.com',
          idToken: opts.token,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      );
    }

    // Bright white canvas stream to expose low-contrast white overlays & deterministic torch support
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const fakeMediaDevices = {
      getUserMedia: async () => {
        const stream = canvas.captureStream(1);
        const [track] = stream.getVideoTracks();
        if (track) {
          (track as unknown as Record<string, unknown>)['getCapabilities'] = () =>
            opts.torchSupported ? { torch: true } : {};
          (track as unknown as Record<string, unknown>)['applyConstraints'] = async () => {};
        }
        return stream;
      },
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: fakeMediaDevices,
    });
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  }, { ...options, token });
}

test.describe('Mobile UI Visibility & Accessibility Audit', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
  });

  test('self-check: catches seeded defects and passes clean mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });

    // Clean baseline fixture
    await page.setContent(`
      <html lang="en">
        <head><title>Clean Fixture</title></head>
        <body style="margin:0;padding:16px;background:#111;color:#fff;font-family:sans-serif;">
          <main style="display:flex;justify-content:space-between;align-items:center;">
            <h1 style="margin:0;font-size:18px;">Clean App</h1>
            <button type="button" aria-label="Settings" style="width:48px;height:48px;background:#222;color:#fff;border:1px solid #555;">⚙</button>
          </main>
        </body>
      </html>
    `);
    await waitForFontsAndPaint(page);
    const clean = await runDomAudit(page);
    expect(clean.errors).toEqual([]);

    // Broken fixture covering every invariant
    await page.setContent(`
      <html lang="en">
        <body style="margin:0;background:#111;color:#fff;font-family:sans-serif;">
          <div style="position:relative;height:120px;">
            <span style="position:absolute;left:150px;top:16px;pointer-events:none;white-space:nowrap;">Overlapped Title</span>
            <button type="button" style="position:absolute;left:140px;top:10px;width:48px;height:48px;background:#333;color:#fff;">A</button>
            <button type="button" style="position:absolute;left:170px;top:10px;width:48px;height:48px;background:#444;color:#fff;">B</button>
            <button type="button" style="position:absolute;left:340px;top:10px;width:48px;height:48px;background:#555;color:#fff;">Out</button>
            <button type="button" style="position:absolute;left:10px;top:70px;width:18px;height:18px;"><span class="material-symbols-rounded">close</span></button>
            <div style="position:absolute;left:50px;top:70px;width:40px;overflow:hidden;white-space:nowrap;">SuperLongUnwrappedLabel</div>
          </div>
        </body>
      </html>
    `);
    await waitForFontsAndPaint(page);
    const broken = await runDomAudit(page);
    const rules = new Set(broken.errors.map((e: AuditFinding) => e.rule));
    expect(rules.has('viewport-overflow')).toBe(true);
    expect(rules.has('button-overlap')).toBe(true);
    expect(rules.has('button-occluded')).toBe(true);
    expect(rules.has('text-occluded-by-control')).toBe(true);
    expect(rules.has('text-overflow')).toBe(true);
    expect(rules.has('touch-target-size')).toBe(true);
    expect(rules.has('icon-button-missing-label')).toBe(true);
  });

  async function auditState(
    page: Page,
    viewportLabel: string,
    locale: 'es-AR' | 'en-US',
    state: string,
  ): Promise<void> {
    await waitForFontsAndPaint(page);
    const { errors, warnings } = await runDomAudit(page);

    if (errors.length > 0 || warnings.length > 0) {
      const safeName = `${viewportLabel}_${locale}_${state}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      await captureAnnotatedScreenshot(
        page,
        [...errors, ...warnings],
        path.join(SHOTS_DIR, `${safeName}.png`),
      );
    }

    expect
      .soft(errors, `[${viewportLabel} ${locale} ${state}] ${errors.map((e) => `${e.rule}: ${e.message}`).join(' | ')}`)
      .toEqual([]);
  }

  for (const vp of [
    { label: '360x740', width: 360, height: 740 },
    { label: '412x892', width: 412, height: 892 },
  ]) {
    for (const locale of ['es-AR', 'en-US'] as const) {
      test(`audit all mobile states at ${vp.label} (${locale})`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await setupMobileEnvironment(page, {
          locale,
          torchSupported: true,
          withHistory: true,
          signedIn: false,
        });
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.locator('app-lens').waitFor({ state: 'visible' });

        // 1. Live view (with torch + history badge) + Playwright trial click check on header buttons
        await auditState(page, vp.label, locale, 'live-with-torch-and-history');
        for (const btn of await page.locator('.top-app-bar button:visible').all()) {
          await expect.soft(btn).toBeVisible();
          try {
            await btn.click({ trial: true, timeout: 2000 });
          } catch (err) {
            expect.soft(false, `Header button failed trial click: ${String(err)}`).toBe(true);
          }
        }

        // 2. Overflow menu
        await page.locator('.top-app-bar .control-right > button').last().click();
        await page.locator('.overflow-menu').waitFor({ state: 'visible' });
        await auditState(page, vp.label, locale, 'overflow-menu');
        await page.locator('.menu-backdrop').click();

        // 3. Frozen bottom sheet (half -> full -> peek + toast + offers)
        await page.locator('.double-ring-shutter').click();
        await page.locator('.m3-bottom-sheet').waitFor({ state: 'visible' });
        await auditState(page, vp.label, locale, 'frozen-sheet-half');

        await page.locator('.sheet-drag-handle-bar').click();
        await auditState(page, vp.label, locale, 'frozen-sheet-full');

        // Inject sample offers in dev mode to stress-test guest banner & offer cards
        await page.evaluate(() => {
          const ng = (window as unknown as { ng?: { getComponent: (el: Element) => unknown } }).ng;
          const lensEl = document.querySelector('app-lens');
          const comp = lensEl && ng ? (ng.getComponent(lensEl) as { pipelineService?: { _state?: { update: (fn: (s: Record<string, unknown>) => Record<string, unknown>) => void } } }) : null;
          comp?.pipelineService?._state?.update((s) => ({
            ...s,
            offers: [
              {
                id: 'off_1',
                product: 'Leche entera orgánica La Serenísima 1L',
                price: '$1850',
                priceRating: 1,
                quantity: { quantity: 1, unit: 'L' },
                coordinates: { latitude: -34.6, longitude: -58.38, isApproximate: false },
                boundingBox: { x: 10, y: 10, width: 100, height: 40 },
                confidence: 0.96,
                detections: [],
              },
            ],
          }));
        });
        await auditState(page, vp.label, locale, 'frozen-sheet-with-offers-guest');

        // 4. Settings modal over frozen sheet (stacking-context trap check)
        await page.locator('app-settings button.icon-btn').click();
        await auditState(page, vp.label, locale, 'modal-settings-over-frozen-sheet');
        await page.locator('app-settings .close-btn').click({ force: true });

        // Resume live camera via the sheet's Resume Camera button (shutter is behind snap-full sheet)
        await page.locator('.sheet-section-header .text-btn').click();
        await page.locator('.m3-bottom-sheet').waitFor({ state: 'hidden' });

        // 5. Shopping List modal (populated)
        await page.locator('.top-app-bar .control-right > button').first().click();
        await page.locator('.shopping-list-modal-sheet').waitFor({ state: 'visible' });
        await auditState(page, vp.label, locale, 'modal-shopping-list-populated');
        await page.locator('.shopping-list-modal-sheet .close-btn').click({ force: true });

        // 6. Account modal (guest)
        await page.locator('.profile-btn').click();
        await page.locator('.account-sheet').waitFor({ state: 'visible' });
        await auditState(page, vp.label, locale, 'modal-account-guest');
        await page.locator('.account-sheet .close-btn').click({ force: true });

        // 7. History modal (populated)
        await page.locator('.history-thumb-btn').click();
        await page.locator('.history-sheet').waitFor({ state: 'visible' });
        await auditState(page, vp.label, locale, 'modal-history-populated');
        await page.locator('.history-sheet .close-btn').click({ force: true });

        // 8. Feedback, Permissions, Privacy, Terms modals
        for (const [idx, name] of [
          [0, 'modal-feedback'],
          [1, 'modal-permissions'],
          [2, 'modal-privacy'],
          [3, 'modal-terms'],
        ] as const) {
          await page.locator('.top-app-bar .control-right > button').last().click();
          await page.locator('.overflow-menu .menu-item').nth(idx).click();
          await page.locator('.dialog-sheet').waitFor({ state: 'visible' });
          await auditState(page, vp.label, locale, name);
          await page.locator('.dialog-sheet .close-btn').click({ force: true });
        }
      });
    }
  }

  test('stress test: keyboard focus/Escape, 412x480 keyboard height, and 150% font scale', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 480 });
    await setupMobileEnvironment(page, {
      locale: 'es-AR',
      torchSupported: false,
      withHistory: false,
      signedIn: true,
      isAdmin: true,
      emptyShoppingList: true,
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('app-lens').waitFor({ state: 'visible' });

    // Bump root font size to 150% (24px) to test WCAG 1.4.4 text resize
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '24px';
    });
    await auditState(page, '412x480-150pct', 'es-AR', 'live-default');

    // Admin settings modal (includes extra API URL field) + Escape & focus-trap check
    await page.locator('app-settings button.icon-btn').click();
    await auditState(page, '412x480-150pct', 'es-AR', 'modal-settings-admin');

    await page.keyboard.press('Tab');
    const focusInsideModal = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('app-settings .modal-card')),
    );
    expect.soft(focusInsideModal, 'Tab focus should stay inside open Settings modal').toBe(true);

    await page.keyboard.press('Escape');
    let settingsClosedOnEscape = true;
    try {
      await page.locator('app-settings .modal-card').waitFor({ state: 'hidden', timeout: 2000 });
    } catch {
      settingsClosedOnEscape = false;
    }
    expect.soft(settingsClosedOnEscape, 'Escape should close open Settings modal').toBe(true);
    if (!settingsClosedOnEscape) {
      await page.locator('app-settings .close-btn').click({ force: true });
    }

    // Signed-in Account modal at 412x480
    await page.locator('.profile-btn').click();
    await auditState(page, '412x480-150pct', 'es-AR', 'modal-account-signed-in');
  });
});
