import { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export type Severity = 'error' | 'warning';

export interface AuditFinding {
  rule: string;
  severity: Severity;
  message: string;
  selector: string;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface AuditResult {
  state: string;
  viewport: string;
  locale: string;
  errors: AuditFinding[];
  warnings: AuditFinding[];
}

export async function waitForFontsAndPaint(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await Promise.race([
        document.fonts.ready,
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    }
    if (typeof document.getAnimations === 'function') {
      await Promise.race([
        Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
        new Promise<void>((resolve) => setTimeout(resolve, 400)),
      ]);
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

export async function runDomAudit(page: Page): Promise<{
  errors: AuditFinding[];
  warnings: AuditFinding[];
}> {
  const domFindings = await page.evaluate(() => {
    const errors: AuditFinding[] = [];
    const warnings: AuditFinding[] = [];

    const INTERACTIVE_SELECTOR =
      'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';

    function cssPath(el: Element): string {
      if (el.id) return `#${el.id}`;
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur && cur !== document.body && parts.length < 4) {
        let seg = cur.tagName.toLowerCase();
        const cls = Array.from(cur.classList)
          .filter((c) => !c.startsWith('ng-'))
          .slice(0, 2);
        if (cls.length) seg += `.${cls.join('.')}`;
        parts.unshift(seg);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    }

    function isVisible(el: Element): boolean {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0.5 && rect.height > 0.5;
    }

    function toRect(r: DOMRect) {
      return {
        x: Math.round(r.left * 10) / 10,
        y: Math.round(r.top * 10) / 10,
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
      };
    }

    function overlapArea(a: DOMRect, b: DOMRect, tol = 2): boolean {
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return ox > tol && oy > tol;
    }

    // 0. Determine active layer so backdrops don't cause false occlusion alerts on dimmed background
    const modalCandidates = Array.from(
      document.querySelectorAll('.modal-card, .modal-sheet, [role="dialog"]'),
    ).filter(isVisible);
    const activeModal = modalCandidates[modalCandidates.length - 1] ?? null;
    const activeMenu = !activeModal
      ? (Array.from(document.querySelectorAll('.overflow-menu')).find(isVisible) ?? null)
      : null;
    const activeRoot: Element =
      activeModal ?? activeMenu ?? document.querySelector('app-lens') ?? document.body;

    // 0b. Layer integrity: verify active modal/menu itself isn't covered by another stacking context
    if (activeModal || activeMenu) {
      const layer = activeModal ?? activeMenu!;
      const r = layer.getBoundingClientRect();
      const cx = Math.min(window.innerWidth - 2, Math.max(2, r.left + r.width / 2));
      const cy = Math.min(window.innerHeight - 2, Math.max(2, r.top + r.height / 2));
      const hit = document.elementFromPoint(cx, cy);
      if (hit && !layer.contains(hit) && !hit.contains(layer)) {
        errors.push({
          rule: 'layer-occluded',
          severity: 'error',
          message: `Active overlay is covered at center by ${cssPath(hit)} (stacking context trap)`,
          selector: cssPath(layer),
          rect: toRect(r),
        });
      }
    }

    // 1. Viewport horizontal overflow
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      errors.push({
        rule: 'viewport-overflow',
        severity: 'error',
        message: `Document scrollWidth (${document.documentElement.scrollWidth}px) exceeds innerWidth (${window.innerWidth}px)`,
        selector: 'html',
      });
    }

    // Collect visible interactive controls in active layer
    const controls = Array.from(activeRoot.querySelectorAll(INTERACTIVE_SELECTOR)).filter(isVisible);

    function hasScrollableAncestor(el: Element): boolean {
      let cur = el.parentElement;
      while (cur && cur !== document.body) {
        const s = getComputedStyle(cur);
        const scrollY =
          (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
          cur.scrollHeight > cur.clientHeight + 2;
        const scrollX =
          (s.overflowX === 'auto' || s.overflowX === 'scroll') &&
          cur.scrollWidth > cur.clientWidth + 2;
        if (scrollY || scrollX) {
          return true;
        }
        cur = cur.parentElement;
      }
      return false;
    }

    // 2. Out-of-bounds check for active overlay container and controls
    const boundsTargets = activeModal
      ? [activeModal, ...controls]
      : activeMenu
        ? [activeMenu, ...controls]
        : controls;

    for (const el of boundsTargets) {
      if (el !== activeModal && hasScrollableAncestor(el)) continue;
      const r = el.getBoundingClientRect();
      if (
        r.left < -1 ||
        r.top < -1 ||
        r.right > window.innerWidth + 1 ||
        r.bottom > window.innerHeight + 1
      ) {
        errors.push({
          rule: 'viewport-overflow',
          severity: 'error',
          message: `Element extends outside viewport (${window.innerWidth}x${window.innerHeight}): [${Math.round(r.left)}, ${Math.round(r.top)}, ${Math.round(r.right)}, ${Math.round(r.bottom)}]`,
          selector: cssPath(el),
          rect: toRect(r),
        });
      }
    }

    // 3. Parent clipping check (overflow: hidden | clip)
    const clipTargets = Array.from(
      activeRoot.querySelectorAll('button, a[href], input, select, textarea, h1, h2, h3, label, p, span'),
    ).filter((el) => isVisible(el) && !el.classList.contains('material-symbols-rounded'));

    for (const el of clipTargets) {
      if (hasScrollableAncestor(el)) continue;
      const r = el.getBoundingClientRect();
      let cur = el.parentElement;
      while (cur && cur !== document.documentElement) {
        const s = getComputedStyle(cur);
        const clipX = s.overflowX === 'hidden' || s.overflowX === 'clip';
        const clipY = s.overflowY === 'hidden' || s.overflowY === 'clip';
        if ((clipX || clipY) && !cur.classList.contains('thumb-img-wrapper')) {
          const pr = cur.getBoundingClientRect();
          if (
            (clipX && (r.left < pr.left - 1.5 || r.right > pr.right + 1.5)) ||
            (clipY && (r.top < pr.top - 1.5 || r.bottom > pr.bottom + 1.5))
          ) {
            errors.push({
              rule: 'parent-clipping',
              severity: 'error',
              message: `Element is clipped by ancestor ${cssPath(cur)} (overflow: ${s.overflowX}/${s.overflowY})`,
              selector: cssPath(el),
              rect: toRect(r),
            });
            break;
          }
        }
        cur = cur.parentElement;
      }
    }

    function isScrolledOutOfView(el: Element): boolean {
      const r = el.getBoundingClientRect();
      let cur = el.parentElement;
      while (cur && cur !== document.body) {
        const s = getComputedStyle(cur);
        const scrollY =
          (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
          cur.scrollHeight > cur.clientHeight + 2;
        const scrollX =
          (s.overflowX === 'auto' || s.overflowX === 'scroll') &&
          cur.scrollWidth > cur.clientWidth + 2;
        if (scrollY || scrollX) {
          const pr = cur.getBoundingClientRect();
          if (
            (scrollY && (r.bottom > pr.bottom + 1 || r.top < pr.top - 1)) ||
            (scrollX && (r.right > pr.right + 1 || r.left < pr.left - 1))
          ) {
            return true;
          }
        }
        cur = cur.parentElement;
      }
      return false;
    }

    // 4. Button occlusion (5-point elementFromPoint) & sibling overlap
    for (const el of controls) {
      if (isScrolledOutOfView(el)) continue;
      const r = el.getBoundingClientRect();
      const pts: [number, number][] = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + r.width * 0.2, r.top + r.height * 0.2],
        [r.left + r.width * 0.8, r.top + r.height * 0.2],
        [r.left + r.width * 0.2, r.top + r.height * 0.8],
        [r.left + r.width * 0.8, r.top + r.height * 0.8],
      ];
      let occludedCount = 0;
      let centerHit: Element | null = null;
      for (let i = 0; i < pts.length; i++) {
        const [px, py] = pts[i];
        if (px < 0 || py < 0 || px >= window.innerWidth || py >= window.innerHeight) continue;
        const hit = document.elementFromPoint(px, py);
        if (hit && !el.contains(hit) && !hit.contains(el)) {
          occludedCount++;
          if (i === 0) centerHit = hit;
        }
      }
      if (centerHit || occludedCount >= 2) {
        errors.push({
          rule: 'button-occluded',
          severity: 'error',
          message: `Interactive control occluded (${occludedCount}/5 pts) by ${centerHit ? cssPath(centerHit) : 'another element'}`,
          selector: cssPath(el),
          rect: toRect(r),
        });
      }
    }

    for (let i = 0; i < controls.length; i++) {
      const a = controls[i];
      if (isScrolledOutOfView(a)) continue;
      const ra = a.getBoundingClientRect();
      for (let j = i + 1; j < controls.length; j++) {
        const b = controls[j];
        if (a.contains(b) || b.contains(a) || isScrolledOutOfView(b)) continue;
        const rb = b.getBoundingClientRect();
        if (overlapArea(ra, rb, 2)) {
          errors.push({
            rule: 'button-overlap',
            severity: 'error',
            message: `Interactive control overlaps sibling ${cssPath(b)}`,
            selector: cssPath(a),
            rect: toRect(ra),
          });
        }
      }
    }

    // 5. Text overflow & text occluded by interactive controls (including pointer-events: none titles)
    const textElements = Array.from(activeRoot.querySelectorAll('*')).filter(
      (el) => isVisible(el) && !el.classList.contains('material-symbols-rounded'),
    );

    for (const el of textElements) {
      const s = getComputedStyle(el);
      const hasDirectText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim().length > 0,
      );
      if (!hasDirectText) continue;

      // 5a. Scroll overflow inside element
      const allowsXScroll = s.overflowX === 'auto' || s.overflowX === 'scroll';
      const allowsEllipsis = s.textOverflow === 'ellipsis' && s.overflowX === 'hidden';
      if (!allowsXScroll && !allowsEllipsis && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) {
        errors.push({
          rule: 'text-overflow',
          severity: 'error',
          message: `Text overflows container width (scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}): "${el.textContent?.trim().slice(0, 40)}"`,
          selector: cssPath(el),
          rect: toRect(el.getBoundingClientRect()),
        });
      }

      // 5b. Range.getClientRects() glyph collision with sibling controls
      if (isScrolledOutOfView(el)) continue;
      const range = document.createRange();
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE || !(node.textContent || '').trim()) continue;
        range.selectNodeContents(node);
        for (const textRect of Array.from(range.getClientRects())) {
          if (textRect.width < 1 || textRect.height < 1) continue;
          for (const ctrl of controls) {
            if (ctrl === el || ctrl.contains(el) || el.contains(ctrl)) continue;
            const cr = ctrl.getBoundingClientRect();
            if (overlapArea(textRect, cr, 2)) {
              errors.push({
                rule: 'text-occluded-by-control',
                severity: 'error',
                message: `Text "${(node.textContent || '').trim().slice(0, 30)}" overlaps interactive control ${cssPath(ctrl)}`,
                selector: cssPath(el),
                rect: toRect(textRect),
              });
              break;
            }
          }
        }
      }
    }

    // 6. Touch target size (WCAG 2.2 AA 24x24 error; < 44x44 mobile warning)
    for (const el of controls) {
      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range') continue;
      const r = el.getBoundingClientRect();
      const minDim = Math.min(r.width, r.height);
      if (minDim < 24) {
        errors.push({
          rule: 'touch-target-size',
          severity: 'error',
          message: `Touch target ${Math.round(r.width)}x${Math.round(r.height)}px is below WCAG 2.2 AA 24x24px minimum`,
          selector: cssPath(el),
          rect: toRect(r),
        });
      } else if (minDim < 44) {
        warnings.push({
          rule: 'touch-target-size',
          severity: 'warning',
          message: `Touch target ${Math.round(r.width)}x${Math.round(r.height)}px is below 44x44px mobile ergonomic target`,
          selector: cssPath(el),
          rect: toRect(r),
        });
      }
    }

    // 7. Custom A11y checks (icon buttons, dialog semantics, clickable non-buttons)
    for (const el of controls) {
      if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
        const nonIconText = Array.from(el.querySelectorAll('*'))
          .filter((c) => !c.classList.contains('material-symbols-rounded'))
          .map((c) => c.textContent?.trim() || '')
          .join('');
        const directText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent?.trim() || '')
          .join('');
        const hasLabel =
          Boolean(el.getAttribute('aria-label')?.trim()) ||
          Boolean(el.getAttribute('aria-labelledby')?.trim()) ||
          Boolean((nonIconText + directText).replace(/[✕×+\-]/g, '').trim());
        if (!hasLabel) {
          errors.push({
            rule: 'icon-button-missing-label',
            severity: 'error',
            message: `Icon/symbol button lacks accessible text or aria-label`,
            selector: cssPath(el),
            rect: toRect(el.getBoundingClientRect()),
          });
        }
      }
    }

    if (activeModal) {
      const role = activeModal.getAttribute('role');
      const hasName =
        Boolean(activeModal.getAttribute('aria-label')?.trim()) ||
        Boolean(activeModal.getAttribute('aria-labelledby')?.trim());
      if (role !== 'dialog' && role !== 'alertdialog') {
        errors.push({
          rule: 'dialog-semantics',
          severity: 'error',
          message: `Modal container is missing role="dialog"`,
          selector: cssPath(activeModal),
          rect: toRect(activeModal.getBoundingClientRect()),
        });
      }
      if (activeModal.getAttribute('aria-modal') !== 'true') {
        warnings.push({
          rule: 'dialog-semantics',
          severity: 'warning',
          message: `Dialog is missing aria-modal="true"`,
          selector: cssPath(activeModal),
          rect: toRect(activeModal.getBoundingClientRect()),
        });
      }
      if (!hasName) {
        errors.push({
          rule: 'dialog-semantics',
          severity: 'error',
          message: `Dialog is missing aria-label or aria-labelledby`,
          selector: cssPath(activeModal),
          rect: toRect(activeModal.getBoundingClientRect()),
        });
      }
    }

    for (const el of Array.from(activeRoot.querySelectorAll('div, span')).filter(isVisible)) {
      if (
        getComputedStyle(el).cursor === 'pointer' &&
        !el.closest('button, a, [role="button"], select, label') &&
        el.getAttribute('role') !== 'button'
      ) {
        warnings.push({
          rule: 'non-semantic-interactive',
          severity: 'warning',
          message: `Clickable element <${el.tagName.toLowerCase()}> lacks button/role="button" semantics`,
          selector: cssPath(el),
          rect: toRect(el.getBoundingClientRect()),
        });
      }
    }

    return { errors, warnings };
  });

  // 8. Run axe-core WCAG 2.1/2.2 AA on active page
  const axeResult = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();

  for (const v of axeResult.violations) {
    for (const node of v.nodes) {
      domFindings.errors.push({
        rule: `axe:${v.id}`,
        severity: 'error',
        message: `${v.help} (${v.impact ?? 'unknown'})`,
        selector: node.target.join(' '),
      });
    }
  }

  return domFindings;
}

export async function captureAnnotatedScreenshot(
  page: Page,
  findings: AuditFinding[],
  filePath: string,
): Promise<void> {
  const boxes = findings.filter((f) => f.rect);
  await page.evaluate((items) => {
    const container = document.createElement('div');
    container.id = '__audit-overlay__';
    Object.assign(container.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '2147483647',
    });
    for (const item of items) {
      if (!item.rect) continue;
      const box = document.createElement('div');
      const color = item.severity === 'error' ? '#ff2d2d' : '#f59e0b';
      Object.assign(box.style, {
        position: 'fixed',
        left: `${item.rect.x}px`,
        top: `${item.rect.y}px`,
        width: `${Math.max(4, item.rect.width)}px`,
        height: `${Math.max(4, item.rect.height)}px`,
        border: `2px solid ${color}`,
        background: item.severity === 'error' ? 'rgba(255,45,45,0.14)' : 'rgba(245,158,11,0.12)',
        boxSizing: 'border-box',
      });
      container.appendChild(box);
    }
    document.body.appendChild(container);
  }, boxes);

  await page.screenshot({ path: filePath });

  await page.evaluate(() => {
    document.getElementById('__audit-overlay__')?.remove();
  });
}
