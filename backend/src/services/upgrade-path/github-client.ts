/* eslint-disable no-await-in-loop */
import RE2 from "re2";

import { FormattedRelease, GitHubApiError, GitHubRelease } from "./types";

interface GitHubClientConfig {
  token?: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  maxPagesPerRequest: number;
  perPage: number;
}

interface RateLimitInfo {
  remaining: number;
  reset: Date;
  used: number;
  limit: number;
}

const getDefaultConfig = (): GitHubClientConfig => ({
  token: process.env.GITHUB_TOKEN,
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  maxPagesPerRequest: 10,
  perPage: 100
});

const getHeaders = (token?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Infisical-Upgrade-Path-Tool/1.0",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  if (token) {
    headers.Authorization = `token ${token}`;
  }

  return headers;
};

const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const isMainInfisicalRelease = (tagName: string): boolean => {
  if (
    tagName.startsWith("infisical-cli/") ||
    tagName.startsWith("infisical-k8-operator/") ||
    tagName.startsWith("infisical-k8s-operator/")
  ) {
    return false;
  }
  return tagName.startsWith("v") || tagName.startsWith("infisical/v") || new RE2(/^\d+\.\d+\.\d+/).test(tagName);
};

const normalizeVersion = (tagName: string): string => {
  const versionMatch = tagName.match(new RE2(/(\d+\.\d+\.\d+(?:\.\d+)?)/));
  if (versionMatch) {
    return `v${versionMatch[1]}`;
  }

  if (tagName.startsWith("infisical/")) {
    const withoutPrefix = tagName.replace(new RE2(/^infisical\//), "");
    return withoutPrefix.replace(new RE2(/-[a-zA-Z]+$/), "");
  }
  return tagName.replace(new RE2(/-[a-zA-Z]+$/), "");
};

const makeRequest = async <T>(
  url: string,
  config: GitHubClientConfig,
  retryCount = 0
): Promise<{ data: T; rateLimit: RateLimitInfo }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(url, {
      headers: getHeaders(config.token),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const rateLimit: RateLimitInfo = {
      remaining: parseInt(response.headers.get("X-RateLimit-Remaining") || "0", 10),
      reset: new Date(parseInt(response.headers.get("X-RateLimit-Reset") || "0", 10) * 1000),
      used: parseInt(response.headers.get("X-RateLimit-Used") || "0", 10),
      limit: parseInt(response.headers.get("X-RateLimit-Limit") || "5000", 10)
    };

    if (!response.ok) {
      const error: GitHubApiError = new Error(`GitHub API error: ${response.status}`);
      error.status = response.status;
      error.headers = response.headers;

      if (response.status === 403) {
        const resetTime = rateLimit.reset.toISOString();
        error.message = `GitHub API rate limit exceeded. Remaining: ${rateLimit.remaining}, Reset at: ${resetTime}. ${
          !config.token ? "Consider setting GITHUB_TOKEN environment variable." : ""
        }`;
      }

      if (retryCount < config.maxRetries && (response.status >= 500 || response.status === 403)) {
        await delay(config.retryDelay * 2 ** retryCount);
        return await makeRequest<T>(url, config, retryCount + 1);
      }

      throw error;
    }

    const data = (await response.json()) as T;
    return { data, rateLimit };
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${config.timeout}ms`);
    }

    if (retryCount < config.maxRetries && !(error as GitHubApiError).status) {
      await delay(config.retryDelay * 2 ** retryCount);
      return await makeRequest<T>(url, config, retryCount + 1);
    }

    throw error;
  }
};

export const fetchReleases = async (includePrerelease = false): Promise<FormattedRelease[]> => {
  const config = getDefaultConfig();
  const allReleases: GitHubRelease[] = [];
  let page = 1;
  let hasMorePages = true;

  const maxConcurrentRequests = Math.min(3, config.maxPagesPerRequest);

  while (hasMorePages && page <= config.maxPagesPerRequest) {
    const requests: Promise<{ data: GitHubRelease[]; rateLimit: RateLimitInfo }>[] = [];

    for (let i = 0; i < maxConcurrentRequests && page <= config.maxPagesPerRequest; i += 1, page += 1) {
      const url = `https://api.github.com/repos/Infisical/infisical/releases?page=${page}&per_page=${config.perPage}`;
      requests.push(makeRequest<GitHubRelease[]>(url, config));
    }

    const results = await Promise.allSettled(requests);
    let hasData = false;

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { data } = result.value;
        if (data.length > 0) {
          allReleases.push(...data);
          hasData = true;
        }
      }
    }

    if (!hasData || results.every((r) => r.status === "fulfilled" && r.value.data.length < config.perPage)) {
      hasMorePages = false;
    }
  }

  const formattedReleases = allReleases
    .filter((release) => !release.draft)
    .filter((release) => isMainInfisicalRelease(release.tag_name))
    .map(
      (release): FormattedRelease => ({
        tagName: release.tag_name,
        normalizedTagName: normalizeVersion(release.tag_name),
        name: release.name,
        body: release.body,
        publishedAt: release.published_at,
        prerelease: release.prerelease,
        draft: release.draft
      })
    )
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return formattedReleases.filter((release) => includePrerelease || !release.prerelease);
};
