import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { mintServiceToken } from "../license-client-backends";
import { licenseErrorMessage, readLicenseRequestId } from "../license-client-errors";
import { createSelfHostedTokenProvider } from "../license-token-provider";

export type TUsageSnapshot = {
  dimension_key: string;
  value: number;
  observed_at: string;
  idempotency_key: string;
  source: string;
};

// One metered fact for a sum or count meter. The license server dedups on event_id, so a retry must
// resend the same id; quantity is ignored for a count meter, which counts each event once.
export type TUsageEvent = {
  event_id: string;
  dimension_key: string;
  quantity: number;
  occurred_at: string;
  source: string;
};

export type TUsageEventResult = {
  event_id: string;
  status: "accepted" | "deduped";
};

export type TUsageReporter = {
  reportSnapshots: (orgId: string, snapshots: TUsageSnapshot[]) => Promise<void>;
  reportEvents: (orgId: string, events: TUsageEvent[]) => Promise<TUsageEventResult[]>;
};

// The license server's per-request cap on usage events.
export const MAX_USAGE_EVENTS_PER_REQUEST = 1000;

// Carries the license server's HTTP status + parsed message so callers can special-case responses
// (e.g. swallow a 422 "not priced by any active product on this license") instead of retrying.
export class UsageReportError extends Error {
  readonly status: number;

  readonly serverMessage: string;

  constructor(status: number, serverMessage: string, requestId?: string) {
    super(
      licenseErrorMessage(
        requestId || "unknown",
        `usage report failed with ${status}${serverMessage ? `: ${serverMessage}` : ""}`
      )
    );
    this.name = "UsageReportError";
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

// getBearerToken is called per request so a cloud reporter can mint a fresh short-lived JWT each time,
// while a self-hosted reporter exchanges its license key for a cached JWT at the token endpoint.
export const usageReporterFactory = (serverUrl: string, getBearerToken: () => Promise<string>): TUsageReporter => {
  const post = async (orgId: string, resource: "usage-snapshots" | "usage-events", body: unknown) => {
    const url = new URL(`/v1/organizations/${encodeURIComponent(orgId)}/${resource}`, serverUrl);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${await getBearerToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "manual"
    });

    if (!res.ok) {
      let serverMessage = "";
      try {
        const errBody = (await res.json()) as { message?: string; error?: string };
        serverMessage = errBody?.message ?? errBody?.error ?? "";
      } catch {
        // non-JSON body; leave the message empty
      }
      throw new UsageReportError(res.status, serverMessage, readLicenseRequestId(res));
    }
    return res;
  };

  return {
    reportSnapshots: async (orgId: string, snapshots: TUsageSnapshot[]) => {
      if (!snapshots.length) {
        return;
      }
      await post(orgId, "usage-snapshots", { snapshots });
    },

    // The server accepts or rejects each request as a whole, so a chunk that fails stops the rest;
    // chunks already sent are safe to resend because of event_id dedup.
    reportEvents: async (orgId: string, events: TUsageEvent[]) => {
      const results: TUsageEventResult[] = [];
      for (let i = 0; i < events.length; i += MAX_USAGE_EVENTS_PER_REQUEST) {
        const chunk = events.slice(i, i + MAX_USAGE_EVENTS_PER_REQUEST);
        // eslint-disable-next-line no-await-in-loop
        const body = (await (await post(orgId, "usage-events", { events: chunk })).json()) as {
          results?: TUsageEventResult[];
        };
        results.push(...(body.results ?? []));
      }
      return results;
    }
  };
};

// Returns null when the license server is unconfigured, which keeps usage reporting inert. A
// self-hosted license exchanges its key for a short-lived JWT at the token endpoint and reports with
// that bearer; cloud mints a short-lived RS256 service JWT signed with the service key (the same scheme
// the rest of the license client uses). The raw key/signing key is never sent as the bearer.
export const buildUsageReporter = (
  envConfig: Pick<TEnvConfig, "LICENSE_SERVER_V2_SERVICE_KEY" | "LICENSE_SERVER_URL" | "LICENSE_KEY">
): TUsageReporter | null => {
  // One host serves both the self-hosted token endpoint and the usage API.
  const serverUrl = envConfig.LICENSE_SERVER_URL;
  if (!serverUrl) {
    logger.warn("usage-reporter: LICENSE_SERVER_URL is not set; usage reporting disabled");
    return null;
  }

  // Don't forward the bearer to a non-HTTPS or malformed destination.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(serverUrl);
  } catch {
    logger.warn("usage-reporter: license server URL is not a valid URL; usage reporting disabled");
    return null;
  }
  if (parsedUrl.protocol !== "https:" && process.env.NODE_ENV !== "development") {
    logger.warn("usage-reporter: license server URL must use https; usage reporting disabled");
    return null;
  }

  // Self-hosted (any license key format): exchange the key for a short-lived JWT at the token endpoint
  // and use that. Cloud sets no LICENSE_KEY, so it falls through to the service-JWT path below.
  const licenseKey = envConfig.LICENSE_KEY;
  if (licenseKey) {
    const tokenProvider = createSelfHostedTokenProvider(licenseKey, { serverUrl });
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
