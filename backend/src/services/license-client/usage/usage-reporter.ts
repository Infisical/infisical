import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

const SNAPSHOTS_PATH = "/v1/usage/snapshots";

export type TUsageSnapshot = {
  org_id: string;
  feature_key: string;
  value: number;
  observed_at: string;
  idempotency_key: string;
  source: string;
};

export type TUsageReporter = {
  reportSnapshots: (snapshots: TUsageSnapshot[]) => Promise<void>;
};

export const usageReporterFactory = (serverUrl: string, serviceKey: string): TUsageReporter => ({
  reportSnapshots: async (snapshots: TUsageSnapshot[]) => {
    if (!snapshots.length) {
      return;
    }

    const url = new URL(SNAPSHOTS_PATH, serverUrl);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ snapshots }),
      redirect: "manual"
    });

    if (!res.ok) {
      throw new Error(`usage snapshot report failed with ${res.status}`);
    }
  }
});

// Returns null when the v2 license server is disabled or unconfigured, which keeps usage reporting
// inert until Phase 2 flips LICENSE_SERVER_V2_MODE on.
export const buildUsageReporter = (
  envConfig: Pick<TEnvConfig, "LICENSE_SERVER_V2_MODE" | "LICENSE_SERVER_V2_URL" | "LICENSE_SERVER_V2_SERVICE_KEY">
): TUsageReporter | null => {
  if (envConfig.LICENSE_SERVER_V2_MODE === "off") {
    return null;
  }

  const serverUrl = envConfig.LICENSE_SERVER_V2_URL;
  if (!serverUrl || !envConfig.LICENSE_SERVER_V2_SERVICE_KEY) {
    logger.warn(
      "usage-reporter: enabled but LICENSE_SERVER_V2_URL / LICENSE_SERVER_V2_SERVICE_KEY is missing; usage reporting disabled"
    );
    return null;
  }

  // Don't forward the service-key bearer to a non-HTTPS or malformed destination.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(serverUrl);
  } catch {
    logger.warn("usage-reporter: LICENSE_SERVER_V2_URL is not a valid URL; usage reporting disabled");
    return null;
  }
  if (parsedUrl.protocol !== "https:") {
    logger.warn("usage-reporter: LICENSE_SERVER_V2_URL must use https; usage reporting disabled");
    return null;
  }

  return usageReporterFactory(serverUrl, envConfig.LICENSE_SERVER_V2_SERVICE_KEY);
};
