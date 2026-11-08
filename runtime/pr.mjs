import { execFileSync } from 'node:child_process';
import { resolveReviewRange } from './review.mjs';
import { runProcess } from './process.mjs';

const PR_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9][0-9]*)\/?$/;

export async function resolvePullRequest(cwd, url) {
  const parsed = PR_URL.exec(url);
  if (!parsed) throw new Error('Expected a GitHub pull-request URL');
  const [, owner, repo, number] = parsed;
  const result = await runProcess('gh', ['api', `repos/${owner}/${repo}/pulls/${number}`], { cwd, timeoutMs: 30_000 });
  if (result.code !== 0) throw new Error('Unable to read the requested PR through authenticated GitHub CLI');
  const pr = JSON.parse(result.stdout);
  if (!/^[a-f0-9]{40}$/.test(pr.base?.sha) || !/^[a-f0-9]{40}$/.test(pr.head?.sha) ||
      pr.base?.repo?.full_name?.toLowerCase() !== `${owner}/${repo}`.toLowerCase()) throw new Error('Invalid PR identity response');
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8' }).trim();
  if (![ `https://github.com/${owner}/${repo}`, `git@github.com:${owner}/${repo}` ]
    .some((value) => remote.replace(/\.git$/, '').toLowerCase() === value.toLowerCase())) throw new Error('PR belongs to another repository');
  for (const sha of [pr.base.sha, pr.head.sha]) {
    const fetched = await runProcess('git', ['fetch', '--no-tags', '--', 'origin', sha], { cwd, timeoutMs: 60_000 });
    if (fetched.code !== 0) throw new Error('PR commits are unavailable locally');
  }
  return { ...resolveReviewRange(cwd, pr.base.sha, pr.head.sha), url, number: Number.parseInt(number, 10) };
}
