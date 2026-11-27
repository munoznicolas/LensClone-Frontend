import { Dirent, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const COLOR_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g;
const ALLOWED_EXTS = new Set(['.css', '.html', '.ts']);

// Ratchet baseline of existing literals (scrims, Google OAuth SVGs, chart gradients, TS fallbacks).
// shortcut: baseline counts instead of AST/diff check; tighten counts as remaining files are cleaned up.
const BASELINE_MAX_COUNTS: Record<string, number> = {
  'src/app/features/debug/debug.component.css': 60,
  'src/app/features/desktop-dashboard/desktop-dashboard.component.css': 11,
  'src/app/features/desktop-dashboard/desktop-dashboard.component.html': 4,
  'src/app/features/desktop-dashboard/price-heatmap/price-heatmap.component.css': 15,
  'src/app/features/desktop-dashboard/price-heatmap/price-heatmap.component.ts': 5,
  'src/app/features/lens/lens.component.css': 138,
  'src/app/features/lens/lens.component.html': 4,
  'src/app/features/location-permission-modal/location-permission-modal.component.css': 4,
  'src/app/features/settings/settings.component.css': 5,
  'src/app/features/shopping-list/shopping-list.component.css': 4,
  'src/app/services/visualization/boundingbox-renderer.service.ts': 12,
};

function walk(dir: string): string[] {
  const entries: Dirent[] = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry: Dirent) => {
    const fullPath = join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

describe('Color token guard', () => {
  it('should not introduce new hardcoded color literals outside src/styles.css', () => {
    const root = process.cwd();
    const appDir = join(root, 'src', 'app');
    const violations: string[] = [];

    for (const file of walk(appDir)) {
      if (file.endsWith('.spec.ts')) continue;
      const dot = file.lastIndexOf('.');
      if (dot === -1 || !ALLOWED_EXTS.has(file.slice(dot))) continue;

      const relPath = relative(root, file).replace(/\\/g, '/');
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      const count = lines.reduce(
        (sum: number, line: string) => sum + (line.match(COLOR_LITERAL_RE)?.length ?? 0),
        0,
      );
      const maxAllowed = BASELINE_MAX_COUNTS[relPath] ?? 0;

      if (count > maxAllowed) {
        violations.push(`${relPath}: found ${count} color literals (max allowed: ${maxAllowed})`);
      }
    }

    expect(violations).toEqual([]);
  });
});
