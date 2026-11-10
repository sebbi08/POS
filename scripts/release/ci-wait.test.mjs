import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRun } from './ci-wait.mjs';

test('findRun retries until the run appears', async () => {
  const run = { databaseId: 7, status: 'queued', conclusion: '' };
  const results = [[], [], [run]];
  let sleeps = 0;
  const got = await findRun(async () => results.shift(), {
    attempts: 5,
    delayMs: 1,
    sleep: async () => { sleeps++; },
  });
  assert.deepEqual(got, run);
  assert.equal(sleeps, 2);
});

test('findRun gives up', async () => {
  const got = await findRun(async () => [], { attempts: 3, delayMs: 1, sleep: async () => {} });
  assert.equal(got, null);
});
