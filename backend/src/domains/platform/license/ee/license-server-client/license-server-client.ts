import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { TLicenseServer } from "../../ce/service/dependencies";
import {
  TBuyProductPayload,
  TCancelTrialPayload,
  TChangeCommitmentsPayload,
  TConfirmTrialPaymentPayload,
  TCreatePortalPayload,
  TEntitlementOrg,
  TEntitlementsResponse,
  TLicenseServerBilling,
  TStartTrialPayload,
  TSubscriptionPreviewPayload,
  TUpgradePayload
} from "../../ce/service/license-server-types/license-server-types";
import {
  MAX_USAGE_EVENTS_PER_REQUEST,
  TUsageEvent,
  TUsageEventResult,
  TUsageSnapshot,
  UsageReportError
} from "../../ce/service/license-server-types/usage-reports";
import {
  licenseServerBackend,
  licenseServerSelfHostedBackend,
  mintServiceToken,
  readLicenseRequestId,
  TLicenseClientBackend
} from "./license-server-backends";
import { createSelfHostedTokenProvider } from "./license-token-provider";

export type TLicenseServerClientConfig = {
  envConfig: Pick<
    TEnvConfig,
    "LICENSE_SERVER_V2_SERVICE_KEY" | "LICENSE_SERVER_URL" | "LICENSE_KEY" | "INTERNAL_REGION"
  >;
  // Offline (air-gapped) licenses must never contact the license server; the client stays dormant for them.
  isOffline: boolean;
};

// Returns null (dormant) unless either a self-hosted license key or
// the cloud service key (plus the license server URL) is configured.
const buildBackend = (
  envConfig: TLicenseServerClientConfig["envConfig"],
  isOffline: boolean
): TLicenseClientBackend | null => {
  // An offline (air-gapped) license lives in LICENSE_KEY, but transmitting it would violate the
  // air-gap and leak the signed credential — keep the SDK dormant so no read can POST it to the server.
  if (isOffline) {
    return null;
  }

  const licenseKey = envConfig.LICENSE_KEY;
  if (licenseKey) {
    if (!envConfig.LICENSE_SERVER_URL) {
      logger.warn(
        "license-client: self-hosted key set but LICENSE_SERVER_URL (token endpoint) is missing; serving feature fallbacks"
      );
      return null;
    }
    const tokenProvider = createSelfHostedTokenProvider(licenseKey, { serverUrl: envConfig.LICENSE_SERVER_URL });
    return licenseServerSelfHostedBackend(envConfig.LICENSE_SERVER_URL, tokenProvider, envConfig.INTERNAL_REGION);
  }

  // One host serves both the self-hosted token endpoint and the entitlement API.
  const serverUrl = envConfig.LICENSE_SERVER_URL;
  if (!serverUrl) {
    logger.warn("license-client: LICENSE_SERVER_URL is not set; serving feature fallbacks");
    return null;
  }

  // Guard against a misconfigured base URL pointing the authenticated client at a non-http target.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(serverUrl);
  } catch {
    logger.warn("license-client: LICENSE_SERVER_URL is not a valid URL; serving feature fallbacks");
    return null;
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    logger.warn("license-client: LICENSE_SERVER_URL must use http(s); serving feature fallbacks");
    return null;
  }

  const signingKey = envConfig.LICENSE_SERVER_V2_SERVICE_KEY;
  if (!signingKey) {
    logger.warn("license-client: enabled but LICENSE_SERVER_V2_SERVICE_KEY is missing; serving feature fallbacks");
    return null;
  }

  // The signing key is a PEM private key; env vars often carry it with escaped newlines.
  return licenseServerBackend(serverUrl, signingKey.replace(/\\n/g, "\n"), envConfig.INTERNAL_REGION);
};

// Where usage goes and how each post authenticates. getBearerToken is called per request so cloud can mint a
// fresh short-lived JWT each time, while self-hosted exchanges its license key for a cached JWT.
type TUsageEndpoint = { serverUrl: string; getBearerToken: () => Promise<string> };

// Returns null when the license server is unconfigured, which keeps usage reporting inert. A
// self-hosted license exchanges its key for a short-lived JWT at the token endpoint and reports with
// that bearer; cloud mints a short-lived RS256 service JWT signed with the service key (the same scheme
// the rest of the license client uses). The raw key/signing key is never sent as the bearer.
const buildUsageEndpoint = (envConfig: TLicenseServerClientConfig["envConfig"]): TUsageEndpoint | null => {
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
    return { serverUrl, getBearerToken: () => tokenProvider.getToken() };
  }

  // Cloud: mint a fresh service JWT per request signed with the service key (an RSA private key).
  const serviceKey = envConfig.LICENSE_SERVER_V2_SERVICE_KEY;
  if (!serviceKey) {
    logger.warn(
      "usage-reporter: enabled but LICENSE_SERVER_V2_SERVICE_KEY (cloud) is not set; usage reporting disabled"
    );
    return null;
  }
  return { serverUrl, getBearerToken: () => Promise.resolve(mintServiceToken(serviceKey)) };
};

// Throws UsageReportError with the server's status and message, so a caller can tell a final refusal
// (404 "license not found", 422 "not priced") from a failure worth retrying.
const postUsage = async (
  endpoint: TUsageEndpoint,
  orgId: string,
  resource: "usage-snapshots" | "usage-events",
  body: unknown
) => {
  const url = new URL(`/v1/organizations/${encodeURIComponent(orgId)}/${resource}`, endpoint.serverUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${await endpoint.getBearerToken()}`, "Content-Type": "application/json" },
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

// The License Server over HTTP. Dormant when it is not configured, or when the instance runs on an offline
// license: reads then return nothing and changes are refused.
export class LicenseServerClient implements TLicenseServer, TLicenseServerBilling {
  constructor(
    private readonly backend: TLicenseClientBackend | null,
    private readonly usageEndpoint: TUsageEndpoint | null
  ) {}

  static fromConfig({ envConfig, isOffline }: TLicenseServerClientConfig): LicenseServerClient {
    if (isOffline) return new LicenseServerClient(null, null);
    return new LicenseServerClient(buildBackend(envConfig, isOffline), buildUsageEndpoint(envConfig));
  }

  // False when no license server is reachable (unlicensed self-hosted, or an offline license), so callers can
  // skip work that would only end in a dormant no-op.
  isEnabled(): boolean {
    return this.backend !== null;
  }

  canReportUsage(): boolean {
    return this.usageEndpoint !== null;
  }

  // Entitlements are not cached here: the domain caches the plan it projects from them. Returns null when the
  // License Server cannot be read, so the caller falls back.
  async getEntitlements(org: TEntitlementOrg): Promise<TEntitlementsResponse | null> {
    if (!this.backend) return null;
    try {
      return await this.backend.fetchEntitlements(org);
    } catch (error) {
      logger.error(error, `license-client: failed to resolve entitlements [orgId=${org.id}]`);
      return null;
    }
  }

  async getCatalog(orgId: string) {
    return this.backend ? this.backend.fetchCatalog(orgId) : null;
  }

  async getSubscription(orgId: string) {
    return this.backend ? this.backend.fetchSubscription(orgId) : null;
  }

  async getCloudPlan(orgId: string) {
    return this.backend ? this.backend.fetchCloudPlan(orgId) : null;
  }

  async getBillingProfile(orgId: string) {
    return this.backend ? this.backend.fetchBillingProfile(orgId) : null;
  }

  // An empty history when no backend is configured (self-hosted).
  async getTrials(orgId: string) {
    return this.backend ? this.backend.fetchTrials(orgId) : { trials: [] };
  }

  createPortal(orgId: string, payload: TCreatePortalPayload) {
    return this.configured().createPortalSession(orgId, payload);
  }

  previewSubscriptionChange(orgId: string, payload: TSubscriptionPreviewPayload) {
    return this.configured().previewSubscriptionChange(orgId, payload);
  }

  buyProduct(orgId: string, payload: TBuyProductPayload) {
    return this.configured().buyProduct(orgId, payload);
  }

  removeProduct(orgId: string, productId: string) {
    return this.configured().removeProduct(orgId, productId);
  }

  upgradeProduct(orgId: string, payload: TUpgradePayload) {
    return this.configured().upgradeProduct(orgId, payload);
  }

  changeCommitments(orgId: string, payload: TChangeCommitmentsPayload) {
    return this.configured().changeCommitments(orgId, payload);
  }

  startTrial(orgId: string, payload: TStartTrialPayload) {
    return this.configured().startTrial(orgId, payload);
  }

  cancelTrial(orgId: string, payload: TCancelTrialPayload) {
    return this.configured().cancelTrial(orgId, payload);
  }

  confirmTrialPayment(orgId: string, payload: TConfirmTrialPaymentPayload) {
    return this.configured().confirmTrialPayment(orgId, payload);
  }

  cancelSubscription(orgId: string) {
    return this.configured().cancelSubscription(orgId);
  }

  resumeSubscription(orgId: string) {
    return this.configured().resumeSubscription(orgId);
  }

  async reportSnapshots(orgId: string, snapshots: TUsageSnapshot[]): Promise<void> {
    if (!this.usageEndpoint || !snapshots.length) return;
    await postUsage(this.usageEndpoint, orgId, "usage-snapshots", { snapshots });
  }

  // The server accepts or rejects each request as a whole, so a chunk that fails stops the rest; chunks
  // already sent are safe to resend because of event_id dedup.
  async reportEvents(orgId: string, events: TUsageEvent[]): Promise<TUsageEventResult[]> {
    const endpoint = this.usageEndpoint;
    if (!endpoint) return [];
    const results: TUsageEventResult[] = [];
    for (let i = 0; i < events.length; i += MAX_USAGE_EVENTS_PER_REQUEST) {
      const chunk = events.slice(i, i + MAX_USAGE_EVENTS_PER_REQUEST);
      // eslint-disable-next-line no-await-in-loop
      const body = (await (await postUsage(endpoint, orgId, "usage-events", { events: chunk })).json()) as {
        results?: TUsageEventResult[];
      };
      results.push(...(body.results ?? []));
    }
    return results;
  }

  private configured(): TLicenseClientBackend {
    if (!this.backend) throw new Error("license client backend is not configured");
    return this.backend;
  }
}
