import { readFile } from "fs/promises";
import * as yaml from "js-yaml";
import * as path from "path";
import RE2 from "re2";
import { z } from "zod";

import { TKeyStoreFactory } from "@app/keystore/keystore";

import { fetchReleases } from "./github-client";
import { BreakingChange, FormattedRelease, UpgradePathConfig, UpgradePathResult, VersionConfig } from "./types";

export type TUpgradePathServiceFactory = {
  keyStore: TKeyStoreFactory;
};
export type TUpgradePathService = ReturnType<typeof upgradePathServiceFactory>;

const versionSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(new RE2(/^[a-zA-Z0-9._/-]+$/), "Invalid version format");
const booleanSchema = z.boolean().default(false);

interface CalculateUpgradePathParams {
  fromVersion: string;
  toVersion: string;
  includePrerelease?: boolean;
}

export const upgradePathServiceFactory = ({ keyStore }: TUpgradePathServiceFactory) => {
  const getGitHubReleases = async (includePrerelease = false): Promise<FormattedRelease[]> => {
    const cacheKey = `upgrade-path:releases:${includePrerelease}`;

    try {
      const cached = await keyStore.getItem(cacheKey);
      if (cached) return JSON.parse(cached) as FormattedRelease[];
    } catch (error) {
      // Cache miss, continue to fetch from source
    }

    try {
      const releases = await fetchReleases(booleanSchema.parse(includePrerelease));

      const filteredReleases = releases.filter((v) => !v.tagName.includes("nightly"));

      await keyStore.setItemWithExpiry(cacheKey, 24 * 60 * 60, JSON.stringify(filteredReleases));
      return filteredReleases;
    } catch (error) {
      throw new Error(`GitHub releases unavailable: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const getUpgradePathConfig = async (): Promise<Record<string, VersionConfig>> => {
    const cacheKey = "upgrade-path:config";

    try {
      const cached = await keyStore.getItem(cacheKey);
      if (cached) return JSON.parse(cached) as Record<string, VersionConfig>;
    } catch (error) {
      // Cache miss, continue to fetch from source
    }

    try {
      const yamlPath = path.join(__dirname, "..", "..", "..", "upgrade-path.yaml");
      const yamlContent = await readFile(yamlPath, "utf8");

      if (yamlContent.length > 1024 * 1024) {
        throw new Error("Config file too large");
      }

      const config = yaml.load(yamlContent) as UpgradePathConfig;
      const versionConfig = config?.versions || {};

      await keyStore.setItemWithExpiry(cacheKey, 24 * 60 * 60, JSON.stringify(versionConfig));
      return versionConfig;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        const empty = {};
        await keyStore.setItemWithExpiry(cacheKey, 24 * 60 * 60, JSON.stringify(empty));
        return empty;
      }
      throw new Error(`Config load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const normalizeVersion = (version: string): string => {
    // Extract just the X.X.X.X part from any version format
    const versionMatch = version.match(/(\d+\.\d+\.\d+(?:\.\d+)?)/);
    if (versionMatch) {
      return versionMatch[1];
    }

    // Handle legacy version formats
    if (version.startsWith("infisical/")) {
      return version.replace(new RE2(/^infisical\/v?/), "").replace(new RE2(/-[a-zA-Z]+$/), "");
    }
    return version.replace(new RE2(/^v/), "").replace(new RE2(/-[a-zA-Z]+$/), "");
  };

  const findBreakingChangesForVersion = (
    version: FormattedRelease,
    config: Record<string, VersionConfig>
  ): BreakingChange[] => {
    // Check multiple key variations for breaking changes configuration
    const versionNumber = normalizeVersion(version.tagName);
    const possibleKeys = [
      version.tagName,
      version.normalizedTagName,
      versionNumber,
      `v${versionNumber}`,
      version.tagName.replace(new RE2(/^infisical\//), ""),
      version.tagName.replace(new RE2(/^infisical\/v?/), "").replace(new RE2(/-[a-zA-Z]+$/), "")
    ];

    for (const key of possibleKeys) {
      const versionConfig = config[key];
      if (versionConfig?.breaking_changes?.length) {
        return versionConfig.breaking_changes;
      }
    }
    return [];
  };

  const validateParams = (params: CalculateUpgradePathParams) => {
    const { fromVersion, toVersion, includePrerelease = false } = params;

    versionSchema.parse(fromVersion);
    versionSchema.parse(toVersion);

    if (fromVersion === toVersion) {
      throw new Error("Versions cannot be identical");
    }

    if (fromVersion.includes("nightly") || toVersion.includes("nightly")) {
      throw new Error("Nightly releases are not supported for upgrade path calculation");
    }

    return { fromVersion, toVersion, includePrerelease: booleanSchema.parse(includePrerelease) };
  };

  const calculateUpgradePath = async (params: CalculateUpgradePathParams): Promise<UpgradePathResult> => {
    const { fromVersion, toVersion, includePrerelease } = validateParams(params);
    const cacheKey = `upgrade-path:${fromVersion}:${toVersion}:${includePrerelease}`;

    try {
      const cached = await keyStore.getItem(cacheKey);
      if (cached) return JSON.parse(cached) as UpgradePathResult;
    } catch (error) {
      // Cache miss, continue to fetch from source
    }

    const [releases, config] = await Promise.all([getGitHubReleases(includePrerelease), getUpgradePathConfig()]);

    const cleanFrom = normalizeVersion(fromVersion);
    const cleanTo = normalizeVersion(toVersion);

    const fromIdx = releases.findIndex((r) => normalizeVersion(r.normalizedTagName) === cleanFrom);
    const toIdx = releases.findIndex((r) => normalizeVersion(r.normalizedTagName) === cleanTo);

    if (fromIdx === -1) throw new Error(`Version ${fromVersion} not found`);
    if (toIdx === -1) throw new Error(`Version ${toVersion} not found`);
    if (fromIdx <= toIdx) throw new Error("Invalid version order");

    const upgradePath = releases.slice(toIdx, fromIdx + 1).reverse();
    const [first, last] = [upgradePath[0], upgradePath[upgradePath.length - 1]];

    // Find all versions with breaking changes in the upgrade path
    const withBreakingChanges = upgradePath.filter((version) => {
      const breakingChanges = findBreakingChangesForVersion(version, config);
      return breakingChanges.length > 0;
    });

    // Build the filtered path with breaking change versions
    const filteredPath = [first];

    // Get intermediate versions with breaking changes (excluding first and last)
    const allIntermediateWithBreaking = withBreakingChanges
      .filter((v) => v !== first && v !== last)
      .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());

    // Limit intermediate steps to avoid overly complex upgrade paths
    const maxIntermediateSteps = 8;
    const intermediate =
      allIntermediateWithBreaking.length > maxIntermediateSteps
        ? allIntermediateWithBreaking.slice(-maxIntermediateSteps)
        : allIntermediateWithBreaking;

    filteredPath.push(...intermediate);
    if (last !== first) filteredPath.push(last);

    const breakingChanges: Array<{ version: string; changes: BreakingChange[] }> = [];
    const features: Array<{ version: string; name: string; body: string; publishedAt: string }> = [];
    let hasDbMigration = false;

    // Process versions in upgrade path, excluding starting version
    for (let i = 1; i < upgradePath.length; i += 1) {
      const version = upgradePath[i];
      const isFromVersion = normalizeVersion(version.normalizedTagName) === cleanFrom;

      // Process breaking changes for intermediate versions only
      if (!isFromVersion) {
        const versionBreakingChanges = findBreakingChangesForVersion(version, config);
        if (versionBreakingChanges.length > 0) {
          breakingChanges.push({
            version: version.tagName,
            changes: versionBreakingChanges
          });
        }
      }

      // Process database migrations for intermediate versions only
      if (!isFromVersion) {
        const versionNumber = normalizeVersion(version.tagName);
        const possibleKeys = [
          version.tagName,
          version.normalizedTagName,
          versionNumber,
          `v${versionNumber}`,
          version.tagName.replace(new RE2(/^infisical\//), ""),
          version.tagName.replace(new RE2(/^infisical\/v?/), "").replace(new RE2(/-[a-zA-Z]+$/), "")
        ];

        for (const key of possibleKeys) {
          const versionConfig = config[key];
          if (
            versionConfig?.db_schema_changes &&
            typeof versionConfig.db_schema_changes === "string" &&
            versionConfig.db_schema_changes.trim()
          ) {
            hasDbMigration = true;
            break;
          }
        }
      }

      // Collect release notes and features
      if (version.body) {
        features.push({
          version: version.tagName,
          name: version.name,
          body: version.body,
          publishedAt: version.publishedAt
        });
      }
    }

    const result: UpgradePathResult = {
      path: filteredPath.map((r) => ({
        version: r.tagName,
        name: r.name,
        publishedAt: r.publishedAt,
        prerelease: r.prerelease
      })),
      breakingChanges,
      features,
      hasDbMigration,
      config
    };

    await keyStore.setItemWithExpiry(cacheKey, 60 * 60, JSON.stringify(result));
    return result;
  };

  return {
    getGitHubReleases,
    getUpgradePathConfig,
    calculateUpgradePath: (fromVersion: string, toVersion: string, includePrerelease = false) =>
      calculateUpgradePath({ fromVersion, toVersion, includePrerelease })
  };
};
