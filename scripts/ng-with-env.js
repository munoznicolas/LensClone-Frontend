const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function readClientIdFromEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return '';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*CLIENT_ID\s*=\s*(.+?)\s*$/);
    if (match) {
      return match[1].replace(/^(['"])(.*)\1$/, '$2').trim();
    }
  }
  return '';
}

const clientId = (process.env.CLIENT_ID || '').trim() || readClientIdFromEnvFile();
const args = process.argv.slice(2);
if (clientId) {
  args.push('--define', `__GOOGLE_CLIENT_ID__=${JSON.stringify(clientId)}`);
}

const ngBin = require.resolve('@angular/cli/bin/ng.js');
const result = spawnSync(process.execPath, [ngBin, ...args], { stdio: 'inherit' });
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
