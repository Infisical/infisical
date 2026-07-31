import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { mintServiceToken } from "../license-client-backends";
import { createSelfHostedTokenProvider } from "../license-token-provider";

export type TUsageSnapshot = {
  dimension_key: string;
  value: number;
  observed_at: string;
  idempotency_key: string;
  source: string;
};

export type TUsageReporter = {
  reportSnapshots: (orgId: string, snapshots: TUsageSnapshot[]) => Promise<void>;
};

// Carries the license server's HTTP status + parsed message so callers can special-case responses
// (e.g. swallow a 422 "not priced by any active product on this license") instead of retrying.
export class UsageReportError extends Error {
  readonly status: number;

  readonly serverMessage: string;

  constructor(status: number, serverMessage: string) {
    super(`usage snapshot report failed with ${status}${serverMessage ? `: ${serverMessage}` : ""}`);
    this.name = "UsageReportError";
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

// getBearerToken is called per request so a cloud reporter can mint a fresh short-lived JWT each time,
// while a self-hosted reporter exchanges its license key for a cached JWT at the token endpoint.
export const usageReporterFactory = (serverUrl: string, getBearerToken: () => Promise<string>): TUsageReporter => ({
  reportSnapshots: async (orgId: string, snapshots: TUsageSnapshot[]) => {
    if (!snapshots.length) {
      return;
    }

    const url = new URL(`/v1/organizations/${encodeURIComponent(orgId)}/usage-snapshots`, serverUrl);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${await getBearerToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ snapshots }),
      redirect: "manual"
    });

    if (!res.ok) {
      let serverMessage = "";
      try {
        const body = (await res.json()) as { message?: string; error?: string };
        serverMessage = body?.message ?? body?.error ?? "";
      } catch {
        // non-JSON body; leave the message empty
      }
      throw new UsageReportError(res.status, serverMessage);
    }
  }
});

// Returns null when the v2 license server is disabled or unconfigured, which keeps usage reporting
// inert. A self-hosted v2 license exchanges its key for a short-lived JWT at the token endpoint (on
// LICENSE_SERVER_URL) and reports with that bearer; cloud mints a short-lived RS256 service JWT signed
// with the service key (the same scheme the rest of the v2 client uses). The raw key/signing key is
// never sent as the bearer.
export const buildUsageReporter = (
  envConfig: Pick<
    TEnvConfig,
    | "LICENSE_SERVER_V2_MODE"
    | "LICENSE_SERVER_V2_URL"
    | "LICENSE_SERVER_V2_SERVICE_KEY"
    | "LICENSE_SERVER_URL"
    | "LICENSE_KEY"
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

  // Self-hosted (any license key format): exchange the key for a short-lived JWT at the token endpoint
  // and use that. Cloud sets no LICENSE_KEY, so it falls through to the service-JWT path below.
  const licenseKey = envConfig.LICENSE_KEY;
  if (licenseKey) {
    if (!envConfig.LICENSE_SERVER_URL) {
      logger.warn("usage-reporter: self-hosted key set but LICENSE_SERVER_URL is missing; usage reporting disabled");
      return null;
    }
    const tokenProvider = createSelfHostedTokenProvider(licenseKey, { serverUrl: envConfig.LICENSE_SERVER_URL });
    return usageReporterFactory(serverUrl, () => tokenProvider.getToken());
  }

  // Cloud: mint a fresh service JWT per request signed with the service key (an RSA private key).
  const serviceKey = envConfig.LICENSE_SERVER_V2_SERVICE_KEY;
  if (!serviceKey) {
    logger.warn(
      "usage-reporter: enabled but LICENSE_SERVER_V2_SERVICE_KEY (cloud) is not set; usage reporting disabled"
    );
    return null;
  }
  return usageReporterFactory(serverUrl, () => Promise.resolve(mintServiceToken(serviceKey)));
};
