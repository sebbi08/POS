import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rollback, tagIsPublished } from './rollback.mjs';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'release-rollback-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'master');
  writeFileSync(join(dir, 'package.json'), '{"version":"0.1.0"}\n');
  git('add', '.');
  git('commit', '-qm', 'feat: base');
  return { dir, git, base: git('rev-parse', 'HEAD') };
}

test('rollback undoes the release commit, the tag and a new CHANGELOG.md', (t) => {
  const { dir, git, base } = repo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'package.json'), '{"version":"0.2.0"}\n');
  writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n');
  git('add', '.');
  git('commit', '-qm', 'chore(release): v0.2.0');
  git('tag', '-a', 'v0.2.0', '-m', 'v0.2.0');

  rollback({ git, root: dir, baseCommit: base, tag: 'v0.2.0', changelogExisted: false });

  assert.equal(git('rev-parse', 'HEAD'), base);
  assert.equal(git('tag', '--list', 'v0.2.0'), '');
  assert.equal(existsSync(join(dir, 'CHANGELOG.md')), false);
  assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), '{"version":"0.1.0"}\n');
});

test('rollback before the commit restores edits and removes an unstaged new CHANGELOG.md', (t) => {
  const { dir, git, base } = repo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'package.json'), '{"version":"0.2.0"}\n');
  writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n');

  rollback({ git, root: dir, baseCommit: base, tag: 'v0.2.0', changelogExisted: false });

  assert.equal(git('status', '--porcelain'), '');
  assert.equal(git('rev-parse', 'HEAD'), base);
});

test('rollback keeps a CHANGELOG.md that was already tracked, at its old content', (t) => {
  const { dir, git } = repo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n\nold\n');
  git('add', '.');
  git('commit', '-qm', 'docs: changelog');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n\nnew\n\nold\n');

  rollback({ git, root: dir, baseCommit: base, tag: 'v0.2.0', changelogExisted: true });

  assert.equal(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), '# Changelog\n\nold\n');
});

test('rollback leaves other untracked files alone', (t) => {
  const { dir, git, base } = repo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'notes.txt'), 'mine\n');

  rollback({ git, root: dir, baseCommit: base, tag: 'v0.2.0', changelogExisted: false });

  assert.equal(readFileSync(join(dir, 'notes.txt'), 'utf8'), 'mine\n');
});

test('tagIsPublished asks the remote for exactly that tag', () => {
  const calls = [];
  const git = (...args) => {
    calls.push(args);
    return args.at(-1) === 'refs/tags/v0.2.0' ? 'abc123\trefs/tags/v0.2.0' : '';
  };
  assert.equal(tagIsPublished(git, 'v0.2.0'), true);
  assert.equal(tagIsPublished(git, 'v0.3.0'), false);
  assert.deepEqual(calls[0], ['ls-remote', '--tags', 'origin', 'refs/tags/v0.2.0']);
});
