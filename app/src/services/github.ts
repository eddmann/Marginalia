import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { GithubRepo, ReleaseAsset } from '@/utils/github';

/**
 * Network layer for the "From GitHub URL" import feature. All requests go
 * through Tauri's HTTP client (not browser fetch) to avoid CORS/origin issues,
 * mirroring services/pi/tauriFetch.ts. Public repos only.
 */

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  // GitHub requires a User-Agent on every API request.
  'User-Agent': 'Marginalia',
  'X-GitHub-Api-Version': '2022-11-28',
};

class GithubError extends Error {}

async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await tauriFetch(`${API}${path}`, { headers: API_HEADERS });
  } catch (e) {
    throw new GithubError(`Network error contacting GitHub: ${String(e)}`);
  }
  if (res.status === 404) {
    throw new GithubError('Repository or release not found.');
  }
  if (res.status === 403 || res.status === 429) {
    throw new GithubError(
      'GitHub rate limit reached (unauthenticated requests are limited). Please try again later.',
    );
  }
  if (!res.ok) {
    throw new GithubError(`GitHub API error (${res.status}).`);
  }
  return (await res.json()) as T;
}

export interface RepoInfo {
  defaultBranch: string;
  name: string;
  description: string | null;
  owner: string;
}

export async function fetchRepoInfo(repo: GithubRepo): Promise<RepoInfo> {
  const data = await apiGet<{
    default_branch: string;
    name: string;
    description: string | null;
    owner: { login: string };
  }>(`/repos/${repo.owner}/${repo.repo}`);
  return {
    defaultBranch: data.default_branch,
    name: data.name,
    description: data.description,
    owner: data.owner?.login ?? repo.owner,
  };
}

/**
 * Collect downloadable assets from the repo's releases. Returns the assets of
 * the most recent release that actually has any (so a repo whose newest release
 * is source-only still surfaces earlier binary releases).
 */
export async function fetchReleaseAssets(repo: GithubRepo): Promise<ReleaseAsset[]> {
  let releases: Array<{ assets: Array<{ name: string; browser_download_url: string; size: number }> }>;
  try {
    releases = await apiGet(`/repos/${repo.owner}/${repo.repo}/releases?per_page=20`);
  } catch (e) {
    if (e instanceof GithubError && /not found/i.test(e.message)) return [];
    throw e;
  }
  for (const release of releases) {
    if (release.assets && release.assets.length > 0) {
      return release.assets.map((a) => ({
        name: a.name,
        url: a.browser_download_url,
        size: a.size,
      }));
    }
  }
  return [];
}

/** List every file path in the repo tree at the given branch. */
export async function fetchRepoTree(repo: GithubRepo, branch: string): Promise<string[]> {
  const data = await apiGet<{ tree: Array<{ path: string; type: string }>; truncated: boolean }>(
    `/repos/${repo.owner}/${repo.repo}/git/trees/${branch}?recursive=1`,
  );
  return data.tree.filter((n) => n.type === 'blob').map((n) => n.path);
}

/** Fetch a file's raw text. Uses raw.githubusercontent.com (no API rate limit). */
export async function fetchRawText(
  repo: GithubRepo,
  branch: string,
  path: string,
): Promise<string> {
  const url = `${RAW}/${repo.owner}/${repo.repo}/${branch}/${path}`;
  const res = await tauriFetch(url, { headers: { 'User-Agent': 'Marginalia' } });
  if (!res.ok) throw new GithubError(`Failed to fetch ${path} (${res.status}).`);
  return await res.text();
}

/** Download a release asset's bytes. */
export async function downloadAsset(url: string): Promise<ArrayBuffer> {
  const res = await tauriFetch(url, { headers: { 'User-Agent': 'Marginalia' } });
  if (!res.ok) throw new GithubError(`Failed to download artifact (${res.status}).`);
  return await res.arrayBuffer();
}

/** The raw base URL for resolving relative asset links inside markdown. */
export function rawBaseUrl(repo: GithubRepo, branch: string): string {
  return `${RAW}/${repo.owner}/${repo.repo}/${branch}/`;
}
