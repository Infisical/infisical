import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { mintServiceToken } from "../license-client-backends";

export type TUsageSnapshot = {
  feature_key: string;
  value: number;
  observed_at: string;
  idempotency_key: string;
  source: string;
};

export type TUsageReporter = {
  reportSnapshots: (orgId: string, snapshots: TUsageSnapshot[]) => Promise<void>;
};

// getBearerToken is called per request so a cloud reporter can mint a fresh short-lived JWT each time
// (a self-hosted reporter just returns its static license key).
export const usageReporterFactory = (serverUrl: string, getBearerToken: () => string): TUsageReporter => ({
  reportSnapshots: async (orgId: string, snapshots: TUsageSnapshot[]) => {
    if (!snapshots.length) {
      return;
    }

    const url = new URL(`/v1/${encodeURIComponent(orgId)}/usage-snapshots`, serverUrl);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${getBearerToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ snapshots }),
      redirect: "manual"
    });

    if (!res.ok) {
      throw new Error(`usage snapshot report failed with ${res.status}`);
    }
  }
});

// Mirrors SELF_HOSTED_V2_LICENSE_KEY_PREFIX in ee/license-fns; inlined to avoid a services -> ee import.
const SELF_HOSTED_V2_LICENSE_KEY_PREFIX = "infisical_lk_";

// Returns null when the v2 license server is disabled or unconfigured, which keeps usage reporting
// inert. A self-hosted v2 license reports with its own license key as the bearer; cloud mints a
// short-lived RS256 service JWT signed with the service key (the same scheme the rest of the v2
// client uses), so the raw signing key is never sent over the wire.
export const buildUsageReporter = (
  envConfig: Pick<
    TEnvConfig,
    "LICENSE_SERVER_V2_MODE" | "LICENSE_SERVER_V2_URL" | "LICENSE_SERVER_V2_SERVICE_KEY" | "LICENSE_KEY"
  >
): TUsageReporter | null => {
  if (envConfig.LICENSE_SERVER_V2_MODE === "off") {
    return null;
  }

  const serverUrl = envConfig.LICENSE_SERVER_V2_URL;
  if (!serverUrl) {
    logger.warn("usage-reporter: enabled but LICENSE_SERVER_V2_URL is missing; usage reporting disabled");
    return null;
  }

  // Don't forward the bearer to a non-HTTPS or malformed destination.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(serverUrl);
  } catch {
    logger.warn("usage-reporter: LICENSE_SERVER_V2_URL is not a valid URL; usage reporting disabled");
    return null;
  }
  if (parsedUrl.protocol !== "https:" && process.env.NODE_ENV !== "development") {
    logger.warn("usage-reporter: LICENSE_SERVER_V2_URL must use https; usage reporting disabled");
    return null;
  }

  // Self-hosted: authenticate with the raw license key as the bearer.
  const licenseKey = envConfig.LICENSE_KEY;
  if (licenseKey?.startsWith(SELF_HOSTED_V2_LICENSE_KEY_PREFIX)) {
    return usageReporterFactory(serverUrl, () => licenseKey);
  }

  // Cloud: mint a fresh service JWT per request signed with the service key (an RSA private key).
  const serviceKey = envConfig.LICENSE_SERVER_V2_SERVICE_KEY;
  if (!serviceKey) {
    logger.warn(
      "usage-reporter: enabled but LICENSE_SERVER_V2_SERVICE_KEY (cloud) is not set; usage reporting disabled"
    );
    return null;
  }
  return usageReporterFactory(serverUrl, () => mintServiceToken(serviceKey));
};
