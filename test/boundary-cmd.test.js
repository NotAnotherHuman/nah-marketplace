#!/usr/bin/env node
'use strict';

/**
 * The boundary guard has two failure modes and both are expensive:
 *
 *   Too loose — a write into the hub lands and the branch is unmergeable.
 *   Too tight — the free contract check gets refused mid-build and the agent
 *               reports it cannot verify its own work. This happened live.
 *
 * The "allowed" half matters as much as the "blocked" half.
 */

const path = require('node:path');
const B = require(path.resolve(__dirname, '../plugins/nah-gamedev/hooks/boundary.js'));

let pass = 0, fail = 0;
const blocks = (cmd) => {
  if (B.analyse(cmd, '/repo')) { console.log('  ok   blocked: ' + cmd); pass++; }
  else { console.log('  XX   SHOULD BLOCK: ' + cmd); fail++; }
};
const allows = (cmd, note) => {
  const r = B.analyse(cmd, '/repo');
  if (!r) { console.log('  ok   allowed: ' + cmd); pass++; }
  else { console.log('  XX   SHOULD ALLOW: ' + cmd + ' -> blamed ' + r.target + (note ? '  (' + note + ')' : '')); fail++; }
};

console.log('\n  writes into studio-owned paths — must block');
blocks('echo hello > packages/hub-app/TEST.txt');
blocks('echo hello >> packages/hub-app/TEST.txt');
blocks('echo hi >packages/hub-app/x.txt');
blocks('cat > packages/game-kit/src/x.ts');
blocks('sed -i "s/a/b/" packages/hub-app/src/App.tsx');
blocks('cp art.png packages/sprite-library/art/x.png');
blocks('mv old.md Documentation/NEW.md');
blocks('rm packages/minigames/src/x.ts');
blocks('mkdir -p Documentation/new');
blocks('touch .github/workflows/ci.yml');
blocks('tee ugc-studio/src/pipeline.js');
blocks('chmod +x scripts/dev.sh');
blocks('dd if=/dev/zero of=packages/hub-app/x.bin');
blocks('git apply patch.diff packages/hub-app');
blocks('cd packages/hub-app && echo x > f.txt');
blocks('node -e "require(\'fs\').writeFileSync(\'packages/hub-app/x\',1)"');
blocks('npm test && echo done > Documentation/log.txt');
blocks('cp /repo/a.png /repo/packages/sprite-library/b.png');

console.log('\n  reads, searches and runs — must be allowed');
allows('node ugc-studio/scripts/verify-contract.js puffmerge > /tmp/out.txt',
  'THE REGRESSION: reads a studio script, writes to /tmp');
allows('node ugc-studio/scripts/check-boundary.js --doctor');
allows('node ugc-studio/scripts/verify-contract.js puffmerge 2>&1 | tail -20');
allows('cat packages/hub-app/src/App.tsx');
allows('grep -rn DEFAULT_GAMES packages/hub-app > /tmp/hits.txt');
allows('ls -la Documentation');
allows('npm run dev:hub');
allows('cd packages/hub-app && npm run build');
allows('sed -n "1,50p" packages/hub-app/src/App.tsx');
allows('cp packages/sprite-library/art/x.png packages/puffmerge/public/assets/x.png',
  'copying OUT of the library into your own package');
allows('diff packages/game-kit/src/HubRuntime.ts /tmp/mine.ts');
allows('echo hi > packages/puffmerge/notes.txt');
allows('tsc --noEmit > /tmp/tsc.log');
allows('git add -A && git commit -m "puffmerge: juice"');

console.log('\n  generated hub output — writes allowed, the dev server made them');
allows('rm packages/hub-app/public/game-assets/pm_body.webp',
  'THE DEAD END: the doc said rm was fine, the hook said no');
allows('rm -rf packages/hub-app/public/game-assets/pm_x.webp');
allows('cp packages/puffmerge/public/assets/a.webp packages/hub-app/public/game-assets/a.webp');
blocks('rm packages/hub-app/public/index.html');
blocks('echo x > packages/hub-app/src/App.tsx');

console.log('\n  file_path form (Write / Edit)');
{
  const t = (p, want) => {
    const got = !!B.offender(B.normalize(p, '/repo', null));
    if (got === want) { console.log('  ok   ' + (want ? 'blocked' : 'allowed') + ': ' + p); pass++; }
    else { console.log('  XX   ' + p + ' — expected ' + (want ? 'block' : 'allow')); fail++; }
  };
  t('packages/hub-app/src/App.tsx', true);
  t('/repo/packages/hub-app/src/App.tsx', true);
  t('/somewhere/else/packages/game-kit/x.ts', true);
  t('packages/puffmerge/src/main.ts', false);
  t('packages/puffmerge/public/assets/a.webp', false);
  t('.ugc/puffmerge/report.qa-visual.md', false);
  t('packages/hub-app/public/game-assets/pm_body.webp', false);
  t('packages/hub-app/src/ugc.generated.ts', false);
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
