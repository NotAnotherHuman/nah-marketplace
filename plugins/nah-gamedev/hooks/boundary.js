#!/usr/bin/env node
'use strict';

/**
 * boundary.js — the studio/developer boundary, decided precisely.
 *
 * Reads a PreToolUse payload on stdin. Exits 2 with a reason on stderr to
 * block; exits 0 to allow.
 *
 * WHY THIS IS NOT A SUBSTRING MATCH
 *
 * The first version blocked any Bash command that mentioned a protected path
 * alongside anything that mutates the filesystem. That refused
 *
 *     node ugc-studio/scripts/verify-contract.js <game> > /tmp/out.txt
 *
 * which reads a studio script and writes to /tmp — in the middle of a live
 * build. A guard that blocks the free checks is worse than no guard, because
 * the work routes around it.
 *
 * So: find what each command actually WRITES TO, and judge only that.
 */

const PROTECTED = [
  ['packages/hub-app', 'the hub is shared by every game and the studio wires yours in'],
  ['packages/game-kit', 'the kit is what makes contract compliance structural'],
  ['packages/rewardflow', 'reward presentation is hub-owned'],
  ['packages/minigames', 'bonus games are shared across the app'],
  ['packages/sprite-library', 'the shared art library — add art inside your own package'],
  ['packages/Sprites', 'shared art infrastructure'],
  ['Documentation', 'the contract is what your game is checked against'],
  ['.claude', 'the agent flow itself — improvements come through the plugin'],
  ['ugc-studio', 'studio tooling'],
  ['scripts', 'studio tooling'],
  ['.github', 'CI belongs to the studio'],
];

/**
 * Studio-owned paths the studio's OWN TOOLING writes on every dev run.
 * Refusing writes here left a developer with no legal way to clean up files
 * they never chose to create: the doc said `rm` was fine, the hook said no, and
 * the hook won. A rule with no compliant path is a rule people route around.
 * Deleting committed art here is still caught at submit time by
 * ugc-studio/src/boundary.js.
 */
const EXEMPT = [
  'packages/hub-app/public/game-assets',
  'packages/hub-app/src/ugc.generated.ts',
];

const ALL_ARGS = new Set(['rm', 'rmdir', 'unlink', 'shred', 'truncate', 'touch', 'mkdir', 'tee', 'patch']);
const LAST_ARG = new Set(['cp', 'mv', 'install', 'ln', 'rsync']);
const SKIP_FIRST = new Set(['chmod', 'chown', 'chgrp']);
const INLINE = new Set(['python', 'python3', 'node', 'deno', 'ruby', 'perl', 'php', 'bun']);
const WRITES_IN_CODE = /\bopen\s*\([^)]*['"][wa]|writeFile|appendFile|mkdir|unlink|rename|rmtree|remove\(|\bshutil\b|>\s*['"]?\//;

function segments(cmd) {
  return cmd.split(/\s*(?:&&|\|\||[;\n|])\s*/).filter(Boolean);
}

function tokenize(s) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
  return out;
}

function stripQuotes(s) { return s.replace(/^['"]|['"]$/g, ''); }
const isFlag = (t) => t.startsWith('-');

function writeTargets(tokens) {
  const targets = [];
  const args = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^(?:&|\d+)?>>?$/.test(t)) { if (tokens[i + 1]) targets.push(tokens[++i]); continue; }
    const glued = t.match(/^(?:&|\d+)?>>?(.+)$/);
    if (glued) { targets.push(glued[1]); continue; }
    if (t === '<' || /^\d*<$/.test(t)) { i++; continue; }
    args.push(t);
  }

  if (!args.length) return targets;

  let ci = 0;
  while (ci < args.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[ci])) ci++;
  while (ci < args.length && /^(sudo|env|command|nohup|time|xargs)$/.test(args[ci])) ci++;
  if (ci >= args.length) return targets;

  const cmd = args[ci].replace(/^.*\//, '');
  const rest = args.slice(ci + 1);
  const paths = rest.filter((a) => !isFlag(a));

  if (ALL_ARGS.has(cmd)) targets.push(...paths);
  else if (LAST_ARG.has(cmd)) { if (paths.length) targets.push(paths[paths.length - 1]); }
  else if (SKIP_FIRST.has(cmd)) targets.push(...paths.slice(1));
  else if (cmd === 'sed') {
    if (rest.some((a) => /^-[a-zA-Z]*i/.test(a))) targets.push(...paths.slice(1));
  } else if (cmd === 'dd') {
    for (const a of rest) { const of = a.match(/^of=(.+)$/); if (of) targets.push(of[1]); }
  } else if (cmd === 'git') {
    if (paths[0] === 'apply') targets.push(...paths.slice(1));
  } else if (INLINE.has(cmd)) {
    const code = rest.filter((a, k) => /^-{1,2}[ec]$/.test(rest[k - 1] || '')).join(' ');
    if (code && WRITES_IN_CODE.test(code)) {
      for (const pair of PROTECTED) if (code.includes(pair[0] + '/')) targets.push(pair[0] + '/<inline script>');
    }
  }

  return targets;
}

function cdPrefix(tokens) {
  const args = tokens.filter((t) => !/^(?:&|\d+)?>>?/.test(t));
  if (args[0] !== 'cd' || !args[1]) return null;
  return stripQuotes(args[1]).replace(/^\.\//, '').replace(/\/+$/, '');
}

function normalize(p, root, cwd) {
  let s = stripQuotes(p).replace(/^\.\//, '');
  if (root && s.startsWith(root + '/')) s = s.slice(root.length + 1);
  if (cwd && !s.startsWith('/')) s = cwd + '/' + s;
  return s.replace(/^\.\//, '');
}

function exempt(target) {
  return EXEMPT.some((p) =>
    target === p || target.startsWith(p + '/') ||
    target.indexOf('/' + p + '/') >= 0 || target.endsWith('/' + p));
}

function offender(target) {
  if (exempt(target)) return null;
  for (const pair of PROTECTED) {
    const prefix = pair[0];
    if (target === prefix) return pair;
    if (target.startsWith(prefix + '/')) return pair;
    if (target.indexOf('/' + prefix + '/') >= 0) return pair;
  }
  return null;
}

function analyse(cmd, root) {
  let cwd = null;
  for (const seg of segments(cmd)) {
    const tokens = tokenize(seg);
    const cd = cdPrefix(tokens);
    if (cd !== null) { cwd = (cd === '..' || cd.startsWith('/')) ? null : cd; continue; }
    for (const raw of writeTargets(tokens)) {
      const t = normalize(raw, root, cwd);
      const hit = offender(t);
      if (hit) return { target: t, prefix: hit[0], why: hit[1] };
    }
  }
  return null;
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', () => {
    let payload;
    try { payload = JSON.parse(raw); } catch (e) { process.exit(0); }
    const input = payload.tool_input || {};
    const root = (process.env.CLAUDE_PROJECT_DIR || '').replace(/\/+$/, '');

    if (process.env.NAH_HOOK_LOG) {
      try {
        require('node:fs').appendFileSync(process.env.NAH_HOOK_LOG,
          new Date().toISOString() + ' boundary ' + payload.tool_name + ' ' +
          JSON.stringify(input).slice(0, 400) + '\n');
      } catch (e) { /* logging must never block */ }
    }

    if (typeof input.file_path === 'string' && input.file_path) {
      const rel = normalize(input.file_path, root, null);
      const hit = offender(rel);
      if (hit) {
        console.error('BLOCKED: ' + rel + ' is studio-owned — ' + hit[1]);
        console.error('Your game lives in packages/<gameId>/. If it genuinely needs this change, put it in the handoff notes and the studio will make it.');
        process.exit(2);
      }
      process.exit(0);
    }

    if (typeof input.command === 'string' && input.command) {
      const hit = analyse(input.command, root);
      if (hit) {
        console.error('BLOCKED: this command writes to ' + hit.target + ', inside studio-owned ' + hit.prefix + ' — ' + hit.why);
        console.error('Reading, searching and running anything in there is fine — only writes are refused.');
        console.error('Your game lives in packages/<gameId>/. If it genuinely needs this, put it in the handoff notes.');
        process.exit(2);
      }
    }

    process.exit(0);
  });
}

if (require.main === module) main();
module.exports = { analyse, offender, normalize, writeTargets, tokenize, segments, exempt };
