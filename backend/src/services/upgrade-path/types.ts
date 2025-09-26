export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

export interface FormattedRelease {
  tagName: string;
  normalizedTagName: string;
  name: string;
  body: string;
  publishedAt: string;
  prerelease: boolean;
  draft: boolean;
}

export interface BreakingChange {
  title: string;
  description: string;
  action: string;
}

export interface VersionConfig {
  breaking_changes?: BreakingChange[];
  db_schema_changes?: string;
  notes?: string;
}

export interface UpgradePathConfig {
  versions?: Record<string, VersionConfig>;
}

export interface UpgradePathResult {
  path: Array<{
    version: string;
    name: string;
    publishedAt: string;
    prerelease: boolean;
  }>;
  breakingChanges: Array<{
    version: string;
    changes: BreakingChange[];
  }>;
  features: Array<{
    version: string;
    name: string;
    body: string;
    publishedAt: string;
  }>;
  hasDbMigration: boolean;
  config: Record<string, unknown>;
}

export interface GitHubApiError extends Error {
  status?: number;
  headers?: Headers;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}
