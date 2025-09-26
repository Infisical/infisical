import { readFile } from "fs/promises";
import * as yaml from "js-yaml";
import * as path from "path";
import RE2 from "re2";
import { z } from "zod";

import { TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

import { fetchReleases } from "./github-client";
import { BreakingChange, FormattedRelease, UpgradePathConfig, UpgradePathResult, VersionConfig } from "./types";
import { versionConfigSchema, versionSchema } from "./upgrade-path-schemas";

export type TUpgradePathServiceFactory = {
  keyStore: TKeyStoreFactory;
};
export type TUpgradePathService = ReturnType<typeof upgradePathServiceFactory>;

interface CalculateUpgradePathParams {
  fromVersion: string;
  toVersion: string;
}

export const upgradePathServiceFactory = ({ keyStore }: TUpgradePathServiceFactory) => {
  const sanitizeCacheKey = (key: string): string => {
    return key.replace(new RE2(/[^a-zA-Z0-9\-:._]/g), "_");
  };
  const getGitHubReleases = async (): Promise<FormattedRelease[]> => {
    const cacheKey = "upgrade-path:releases";

    try {
      const cached = await keyStore.getItem(cacheKey);
      if (cached) {
        const cachedReleases = JSON.parse(cached) as FormattedRelease[];
        if (cachedReleases.length > 0) {
          return cachedReleases;
        }
      }
    } catch (error) {
      logger.error(error, "Failed to retrieve releases from cache");
    }

    try {
      const releases = await fetchReleases(false);
      const filteredReleases = releases.filter((v) => !v.tagName.includes("nightly"));

      await keyStore.setItemWithExpiry(cacheKey, 24 * 60 * 60, JSON.stringify(filteredReleases));
      return filteredReleases;
    } catch (error) {
      throw new Error(`GitHub releases unavailable: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const getUpgradePathConfig = async (): Promise<Record<string, z.infer<typeof versionConfigSchema>>> => {
    const cacheKey = "upgrade-path:config";

    try {
      const cached = await keyStore.getItem(cacheKey);
      if (cached) return JSON.parse(cached) as Record<string, VersionConfig>;
    } catch (error) {
      logger.error(error, "Failed to retrieve config from cache");
    }

    try {
      const yamlPath = path.join(__dirname, "..", "..", "..", "upgrade-path.yaml");
      const resolvedPath = path.resolve(yamlPath);
      const expectedBaseDir = path.resolve(__dirname, "..", "..", "..");
      if (!resolvedPath.startsWith(expectedBaseDir)) {
        throw new Error("Invalid configuration file path");
      }

      const yamlContent = await readFile(yamlPath, "utf8");

      if (yamlContent.length > 1024 * 1024) {
        throw new Error("Config file too large");
      }

      const config = yaml.load(yamlContent, { schema: yaml.FAILSAFE_SCHEMA }) as UpgradePathConfig;
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
    const versionRegex = new RE2(/(\d+\.\d+\.\d+(?:\.\d+)?)/);
    const versionMatch = version.match(versionRegex);
    if (versionMatch) {
      return versionMatch[1];
    }

    if (version.startsWith("infisical/")) {
      return version.replace(new RE2(/^infisical\/v?/), "").replace(new RE2(/-[a-zA-Z]+$/), "");
    }
    return version.replace(new RE2(/^v/), "").replace(new RE2(/-[a-zA-Z]+$/), "");
  };

  const validateParams = (params: CalculateUpgradePathParams) => {
    const { fromVersion, toVersion } = params;

    versionSchema.parse(fromVersion);
    versionSchema.parse(toVersion);

    if (fromVersion === toVersion) {
      throw new Error("Versions cannot be identical");
    }

    if (fromVersion.includes("nightly") || toVersion.includes("nightly")) {
      throw new Error("Nightly releases are not supported for upgrade path calculation");
    }

    return { fromVersion, toVersion };
  };

  const calculateUpgradePath = async (params: CalculateUpgradePathParams): Promise<UpgradePathResult> => {
    const { fromVersion, toVersion } = validateParams(params);
    const cacheKey = sanitizeCacheKey(`upgrade-path:${fromVersion}:${toVersion}`);

    try {
      const cached = await keyStore.getItem(cacheKey);
      if (cached) return JSON.parse(cached) as UpgradePathResult;
    } catch (error) {
      logger.error(error, "Failed to retrieve upgrade path from cache");
    }

    const [releases, config] = await Promise.all([getGitHubReleases(), getUpgradePathConfig()]);

    const cleanFrom = normalizeVersion(fromVersion);
    const cleanTo = normalizeVersion(toVersion);

    const compareVersions = (v1: string, v2: string): number => {
      const normalize = (v: string) => normalizeVersion(v);
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

    if (compareVersions(cleanFrom, cleanTo) >= 0) {
      throw new Error("fromVersion must be older than toVersion");
    }

    const fromIdx = releases.findIndex((r) => normalizeVersion(r.normalizedTagName) === cleanFrom);
    const toIdx = releases.findIndex((r) => normalizeVersion(r.normalizedTagName) === cleanTo);

    let upgradePath: FormattedRelease[] = [];
    const filteredPath: FormattedRelease[] = [];

    if (fromIdx !== -1 && toIdx !== -1) {
      if (fromIdx <= toIdx) throw new Error("Invalid version order");
      upgradePath = releases.slice(toIdx, fromIdx + 1).reverse();
      const [first, last] = [upgradePath[0], upgradePath[upgradePath.length - 1]];

      filteredPath.push(first);
      if (last !== first) filteredPath.push(last);
    }

    const breakingChanges: Array<{ version: string; changes: BreakingChange[] }> = [];
    const features: Array<{ version: string; name: string; body: string; publishedAt: string }> = [];
    let hasDbMigration = false;

    const isVersionInRange = (version: string, fromVer: string, toVer: string): boolean => {
      const versionComp = compareVersions(version, fromVer);
      const toVersionComp = compareVersions(version, toVer);
      return versionComp > 0 && toVersionComp < 0;
    };

    Object.keys(config).forEach((configVersion) => {
      const versionConfig = config[configVersion];
      if (versionConfig?.breaking_changes?.length) {
        if (isVersionInRange(configVersion, cleanFrom, cleanTo)) {
          breakingChanges.push({
            version: configVersion,
            changes: versionConfig.breaking_changes
          });
        }
      }
    });
    for (let i = 0; i < upgradePath.length; i += 1) {
      const version = upgradePath[i];
      const isFromVersion = normalizeVersion(version.normalizedTagName) === cleanFrom;

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
    calculateUpgradePath: (fromVersion: string, toVersion: string) => calculateUpgradePath({ fromVersion, toVersion })
  };
};
