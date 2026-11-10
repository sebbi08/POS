import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  latestReleaseTag,
  bumpType,
  nextVersion,
  changelogSection,
  extractSection,
} from './conventional.mjs';

const c = (subject, body = '') => ({ subject, body });

test('latestReleaseTag ignores tse and non-semver tags', () => {
  assert.equal(
    latestReleaseTag(['tse', 'v0.1.0', 'v0.10.0', 'v0.9.1', 'v1.0.0-rc1', 'release']),
    'v0.10.0',
  );
  assert.equal(latestReleaseTag(['tse']), null);
});

test('bumpType', () => {
  assert.equal(bumpType([c('fix: a')]), 'patch');
  assert.equal(bumpType([c('perf: a')]), 'patch');
  assert.equal(bumpType([c('fix: a'), c('feat: b')]), 'minor');
  assert.equal(bumpType([c('feat(x)!: b')]), 'major');
  assert.equal(bumpType([c('fix: a', 'BREAKING CHANGE: y')]), 'major');
  assert.equal(bumpType([c('docs: a'), c('test: b'), c('chore: c')]), null);
  assert.equal(bumpType([c('chore(release): v0.1.0')]), null);
});

test('nextVersion', () => {
  assert.equal(nextVersion('0.1.0', 'minor'), '0.2.0');
  assert.equal(nextVersion('0.2.3', 'patch'), '0.2.4');
  assert.equal(nextVersion('0.2.3', 'major'), '1.0.0');
  assert.equal(nextVersion('1.4.2', 'minor'), '1.5.0');
});

test('changelogSection groups commits and omits docs', () => {
  const out = changelogSection('v0.2.0', '2026-11-10', [
    { subject: 'fix: x', body: '', hash: 'abcdef1234567' },
    { subject: 'docs: y', body: '', hash: '1111111aaaa' },
    { subject: 'feat(terminal): touch keypad', body: '', hash: '20d4be4aaaaaaa' },
  ]);
  assert.equal(
    out,
    [
      '## v0.2.0 (2026-11-10)',
      '',
      '### Features',
      '',
      '- terminal: touch keypad (20d4be4)',
      '',
      '### Bug Fixes',
      '',
      '- x (abcdef1)',
      '',
    ].join('\n'),
  );
});

test('changelogSection lists breaking changes', () => {
  const out = changelogSection('v1.0.0', '2026-11-10', [
    { subject: 'feat(api)!: new shape', body: '', hash: 'aaaaaaa1' },
  ]);
  assert.match(out, /### Breaking Changes\n\n- api: new shape \(aaaaaaa\)/);
});

test('extractSection returns only the requested section', () => {
  const log = [
    '# Changelog',
    '',
    '## v0.2.0 (2026-11-10)',
    '',
    '### Features',
    '',
    '- a (1234567)',
    '',
    '## v0.1.0 (2026-10-01)',
    '',
    '### Bug Fixes',
    '',
    '- b (7654321)',
    '',
  ].join('\n');
  assert.equal(
    extractSection(log, 'v0.2.0'),
    '## v0.2.0 (2026-11-10)\n\n### Features\n\n- a (1234567)',
  );
  assert.equal(
    extractSection(log, 'v0.1.0'),
    '## v0.1.0 (2026-10-01)\n\n### Bug Fixes\n\n- b (7654321)',
  );
  assert.equal(extractSection(log, 'v9.9.9'), null);
});
