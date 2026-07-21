import { getLicenseKeyConfig } from "@app/ee/services/license/license-fns";
import { LicenseType } from "@app/ee/services/license/license-types";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";

import { isVersionNewer, parseSemanticVersion } from "./update-check-fns";

const GITHUB_LATEST_RELEASE_URL = "https://api.github.com/repos/Infisical/infisical/releases/latest";

type TUpdateCheckServiceFactoryDep = {
  cronJob: TCronJobFactory;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

export type TUpdateCheckServiceFactory = ReturnType<typeof updateCheckServiceFactory>;

export const updateCheckServiceFactory = ({ cronJob, keyStore }: TUpdateCheckServiceFactoryDep) => {
  const appCfg = getConfig();

  const licenseKeyConfig = getLicenseKeyConfig();
  const hasOfflineLicense = licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Offline;

  // The update check only applies to standard self-hosted instances: cloud deploys
  // continuously, dedicated instances use hash versions that cannot be compared, and
  // an offline license explicitly signals an intentionally air-gapped instance.
  const isEnabled =
    !appCfg.INFISICAL_CLOUD &&
    !appCfg.isCloud &&
    !appCfg.DISABLE_UPDATE_CHECK &&
    !hasOfflineLicense &&
    Boolean(parseSemanticVersion(appCfg.INFISICAL_PLATFORM_VERSION));

  const refreshLatestVersion = async () => {
    try {
      const { data } = await request.get<{ tag_name?: unknown }>(GITHUB_LATEST_RELEASE_URL, {
        headers: { Accept: "application/vnd.github+json" },
        timeout: 10_000
      });

      const tagName = data.tag_name;
      const latestVersion = typeof tagName === "string" ? tagName.replace(/^v/i, "") : null;
      if (!latestVersion || !parseSemanticVersion(latestVersion)) {
        logger.warn(`update-check: could not interpret latest release tag [tagName=${String(tagName)}]`);
        return;
      }

      await keyStore.setItemWithExpiry(
        KeyStorePrefixes.UpdateCheckLatestVersion,
        KeyStoreTtls.UpdateCheckLatestVersionInSeconds,
        latestVersion
      );
      logger.info(`update-check: refreshed latest platform version [latestVersion=${latestVersion}]`);
    } catch (err) {
      // best effort: air-gapped instances cannot reach GitHub, and a missed refresh
      // only delays the nudge until the next weekly fire, so failures stay quiet
      // instead of surfacing as failed cron runs
      logger.debug(err, "update-check: failed to refresh latest platform version");
    }
  };

  const init = () => {
    if (!isEnabled) return;

    cronJob.register({
      name: CronJobName.InstanceUpdateCheck,
      pattern: "0 0 * * 0", // weekly on Sunday at midnight UTC
      runHashTtlS: 3 * 24 * 60 * 60,
      handler: refreshLatestVersion
    });

    // also refresh once at boot so a fresh instance is not blind until the next Sunday fire
    void keyStore
      .getItem(KeyStorePrefixes.UpdateCheckLatestVersion)
      .then((cached) => (cached ? undefined : refreshLatestVersion()))
      .catch((err) => logger.debug(err, "update-check: failed to refresh latest platform version at boot"));
  };

  // Returns the latest release version when it is newer than the running instance,
  // null otherwise (up to date, check disabled, or no data fetched yet).
  const getAvailableUpdateVersion = async () => {
    if (!isEnabled) return null;

    const latestVersion = await keyStore.getItem(KeyStorePrefixes.UpdateCheckLatestVersion);
    if (!latestVersion) return null;

    const latest = parseSemanticVersion(latestVersion);
    const current = parseSemanticVersion(appCfg.INFISICAL_PLATFORM_VERSION);
    if (!latest || !current) return null;

    return isVersionNewer(latest, current) ? latestVersion : null;
  };

  return { init, getAvailableUpdateVersion };
};
