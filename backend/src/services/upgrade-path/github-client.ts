/* eslint-disable no-await-in-loop */
import RE2 from "re2";

import { getConfig } from "@app/lib/config/env";

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
  token: getConfig().GITHUB_API_TOKEN,
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

  const patterns = [
    new RE2(/^v\d+\.\d+\.\d+/),
    new RE2(/^\d+\.\d+\.\d+/),
    new RE2(/^infisical\/v?\d+\.\d+\.\d+/),
    new RE2(/^infisical\/v?\d+\.\d+\.\d+[-\w]*/)
  ];

  return patterns.some((pattern) => pattern.test(tagName));
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

const compareVersions = (v1: string, v2: string): number => {
  const normalize = (v: string) => {
    const versionMatch = v.match(new RE2(/(\d+\.\d+\.\d+(?:\.\d+)?)/));
    if (versionMatch) {
      return versionMatch[1];
    }
    if (v.startsWith("infisical/")) {
      return v.replace(new RE2(/^infisical\/v?/), "").replace(new RE2(/-[a-zA-Z]+$/), "");
    }
    return v.replace(new RE2(/^v/), "").replace(new RE2(/-[a-zA-Z]+$/), "");
  };

  const clean1 = normalize(v1);
  const clean2 = normalize(v2);

  const parts1 = clean1.split(".").map(Number);
  const parts2 = clean2.split(".").map(Number);

  const maxLength = Math.max(parts1.length, parts2.length);
  while (parts1.length < maxLength) parts1.push(0);
  while (parts2.length < maxLength) parts2.push(0);

  for (let i = 0; i < maxLength; i += 1) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  return 0;
};

const isVersionAtLeastMinimum = (tagName: string, minimumVersion = "0.147.0"): boolean => {
  return compareVersions(tagName, minimumVersion) >= 0;
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
      if (retryCount < config.maxRetries) {
        await delay(config.retryDelay * 2 ** retryCount);
        return await makeRequest<T>(url, config, retryCount + 1);
      }
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
  let reachedMinimumVersion = false;

  const maxConcurrentRequests = Math.min(3, config.maxPagesPerRequest);

  while (hasMorePages && page <= config.maxPagesPerRequest && !reachedMinimumVersion) {
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
          for (const release of data) {
            if (!release.draft && isMainInfisicalRelease(release.tag_name)) {
              if (isVersionAtLeastMinimum(release.tag_name)) {
                allReleases.push(release);
              } else {
                reachedMinimumVersion = true;
                break;
              }
            }
          }
          hasData = true;
        }
      }
    }

    if (!hasData || results.every((r) => r.status === "fulfilled" && r.value.data.length < config.perPage)) {
      hasMorePages = false;
    }
  }

  const formattedReleases = allReleases
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
