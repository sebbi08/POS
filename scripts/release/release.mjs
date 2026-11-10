#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  latestReleaseTag,
  bumpType,
  nextVersion,
  changelogSection,
  extractSection,
} from './conventional.mjs';
import { findRun } from './ci-wait.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const changelogPath = join(root, 'CHANGELOG.md');
const packageDirs = ['.', 'backend', 'frontend', 'terminal'];

function fail(message) {
  console.error(`release aborted: ${message}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
  } catch (err) {
    fail(`\`${cmd} ${args.join(' ')}\` failed: ${err.message}`);
  }
}

const git = (...args) => run('git', args).trim();

const [first, second] = process.argv.slice(2);

if (first === 'notes') {
  if (!second) fail('usage: release.mjs notes vX.Y.Z');
  const section = existsSync(changelogPath)
    ? extractSection(readFileSync(changelogPath, 'utf8'), second)
    : null;
  if (section === null) fail(`no changelog section for ${second}`);
  console.log(section);
  process.exit(0);
}

const dryRun = first === '--dry-run';
if (first && !dryRun) fail(`unknown argument: ${first}`);

// 1. Preconditions
git('fetch', 'origin', '--tags', '--prune');
const problems = [];
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'master') problems.push(`must be on master (on ${branch})`);
if (git('status', '--porcelain') !== '') problems.push('working tree is not clean');
const head = git('rev-parse', 'HEAD');
if (head !== git('rev-parse', 'origin/master')) problems.push('HEAD differs from origin/master');
for (const problem of problems) {
  if (dryRun) console.warn(`warning (dry run): ${problem}`);
  else fail(problem);
}

// 2. Bump
const tag = latestReleaseTag(git('tag', '--list', 'v*').split('\n').filter(Boolean));
if (!tag) fail('no previous release tag (vX.Y.Z) found');
const commits = git('log', `${tag}..HEAD`, '--format=%H%x1f%s%x1f%b%x1e')
  .split('\x1e')
  .map((r) => r.replace(/^\n/, ''))
  .filter((r) => r.trim() !== '')
  .map((r) => {
    const [hash, subject, body = ''] = r.split('\x1f');
    return { hash, subject, body: body.trim() };
  });
const bump = bumpType(commits);
if (!bump) {
  console.log('Nothing to release');
  process.exit(0);
}

// 3. Version + notes
const version = nextVersion(tag.slice(1), bump);
const date = new Date().toISOString().slice(0, 10);
const section = changelogSection(`v${version}`, date, commits);
console.log(`${tag} -> v${version} (${bump})\n`);
console.log(version);
console.log(`\n${section}`);
if (dryRun) process.exit(0);

// 4. CI gate
const listRuns = async () =>
  JSON.parse(
    run('gh', [
      'run', 'list', '--workflow', 'ci.yml', '--branch', 'master', '--event', 'push', '--commit', head,
      '--json', 'databaseId,status,conclusion',
    ]) || '[]',
  );
const ci = await findRun(listRuns, {
  attempts: 12,
  delayMs: 5000,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
});
if (!ci) fail(`no CI run for ${head}`);
try {
  execFileSync('gh', ['run', 'watch', String(ci.databaseId), '--exit-status'], {
    cwd: root,
    stdio: 'inherit',
  });
} catch {
  fail('CI failed on master');
}

// 5. Local changes: bump, changelog, commit, tag
for (const dir of packageDirs) {
  run('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], {
    cwd: join(root, dir),
  });
}
const existing = existsSync(changelogPath)
  ? readFileSync(changelogPath, 'utf8')
  : '# Changelog\n';
const rest = existing.replace(/^# Changelog\n*/, '');
writeFileSync(changelogPath, `# Changelog\n\n${section}\n${rest ? `${rest}` : ''}`);
const files = packageDirs.flatMap((d) => [
  join(d, 'package.json'),
  join(d, 'package-lock.json'),
]);
git('add', ...files, 'CHANGELOG.md');
git('commit', '-m', `chore(release): v${version}`);
git('tag', '-a', `v${version}`, '-m', `v${version}`);

// 6. Publish
git('push', '--atomic', 'origin', 'master', `v${version}`);
console.log(`\nReleased v${version}. Check the pipeline with:`);
console.log('  gh run list --workflow release.yml -L1');
