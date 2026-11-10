import { rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Puts the repo back to `baseCommit`: drops the local release tag, the release
 * commit and the version/changelog edits. Safe at any point of the release
 * because the script refuses to start with uncommitted changes to tracked
 * files; untracked files other than a newly created CHANGELOG.md are kept.
 * `git(...args)` runs git in `root` and throws on failure.
 */
export function rollback({ git, root, baseCommit, tag, changelogExisted }) {
  if (git('tag', '--list', tag) !== '') git('tag', '-d', tag);
  git('reset', '--hard', baseCommit);
  // An unstaged new CHANGELOG.md is untracked, so reset leaves it behind.
  if (!changelogExisted) rmSync(join(root, 'CHANGELOG.md'), { force: true });
}

/** True when `origin` already has the tag, i.e. the release went out. */
export function tagIsPublished(git, tag) {
  return git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`) !== '';
}
