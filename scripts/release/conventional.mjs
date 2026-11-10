const RELEASE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const SUBJECT = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

export function latestReleaseTag(tags) {
  let best = null;
  let bestParts = null;
  for (const tag of tags) {
    const m = RELEASE_TAG.exec(tag);
    if (!m) continue;
    const parts = m.slice(1).map(Number);
    if (
      !bestParts ||
      parts[0] > bestParts[0] ||
      (parts[0] === bestParts[0] &&
        (parts[1] > bestParts[1] || (parts[1] === bestParts[1] && parts[2] > bestParts[2])))
    ) {
      best = tag;
      bestParts = parts;
    }
  }
  return best;
}

function parse(commit) {
  const m = SUBJECT.exec(commit.subject ?? '');
  const breaking =
    Boolean(m && m[3]) || /^BREAKING[ -]CHANGE:/m.test(commit.body ?? '');
  return m
    ? { type: m[1], scope: m[2] || '', breaking, text: m[4] }
    : { type: '', scope: '', breaking, text: commit.subject ?? '' };
}

export function bumpType(commits) {
  let bump = null;
  for (const commit of commits) {
    const p = parse(commit);
    if (p.breaking) return 'major';
    if (p.type === 'feat') bump = 'minor';
    else if ((p.type === 'fix' || p.type === 'perf') && bump === null) bump = 'patch';
  }
  return bump;
}

export function nextVersion(current, bump) {
  const [maj, min, pat] = current.split('.').map(Number);
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  if (bump === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`unknown bump type: ${bump}`);
}

export function changelogSection(version, date, commits) {
  const groups = { breaking: [], feat: [], fix: [] };
  for (const commit of commits) {
    const p = parse(commit);
    const bullet = `- ${p.scope ? `${p.scope}: ` : ''}${p.text} (${String(commit.hash).slice(0, 7)})`;
    if (p.breaking) groups.breaking.push(bullet);
    else if (p.type === 'feat') groups.feat.push(bullet);
    else if (p.type === 'fix' || p.type === 'perf') groups.fix.push(bullet);
  }
  const lines = [`## ${version} (${date})`, ''];
  for (const [key, title] of [
    ['breaking', 'Breaking Changes'],
    ['feat', 'Features'],
    ['fix', 'Bug Fixes'],
  ]) {
    if (groups[key].length === 0) continue;
    lines.push(`### ${title}`, '', ...groups[key], '');
  }
  return lines.join('\n');
}

export function extractSection(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${version} `) || l === `## ${version}`);
  if (start === -1) return null;
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end === -1) end = lines.length;
  return lines.slice(start, end).join('\n').trim();
}
