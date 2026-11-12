import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import {
  TLicenseServer,
  TMeteringEvent,
  TMeteringEventsOutcome,
  TUsageSnapshot,
  TUsageSnapshotOutcome,
  TUsageSource
} from "../../ce/service/dependencies";
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
import { MAX_USAGE_EVENTS_PER_REQUEST } from "../../ce/service/license-server-types/usage-reports";
import { TLicenseServerEntitlements } from "../service/dependencies";
import {
  licenseServerBackend,
  licenseServerSelfHostedBackend,
  mintServiceToken,
  readLicenseRequestId,
  TLicenseClientBackend
} from "./license-server-backends";
import { createSelfHostedTokenProvider } from "./license-token-provider";
import {
  isDimensionNotPriced,
  isLicenseNotFound,
  TUsageEventBody,
  TUsageEventResultBody,
  TUsageSnapshotBody,
  UsageReportError
} from "./usage-wire";

export type TLicenseServerClientConfig = {
  envConfig: Pick<
    TEnvConfig,
    "LICENSE_SERVER_V2_SERVICE_KEY" | "LICENSE_SERVER_URL" | "LICENSE_KEY" | "INTERNAL_REGION"
  >;
  isOffline: boolean;
};

const buildBackend = (envConfig: TLicenseServerClientConfig["envConfig"]): TLicenseClientBackend | null => {
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

// getBearerToken runs per request: cloud mints a fresh short-lived JWT, self-hosted reuses a cached one.
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

// Throws UsageReportError so the client can tell a final no from a retryable failure.
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

// Dormant when unconfigured or on an offline license: reads return nothing, changes throw.
export class LicenseServerClient implements TLicenseServer, TLicenseServerBilling, TLicenseServerEntitlements {
  constructor(
    private readonly backend: TLicenseClientBackend | null,
    private readonly usageEndpoint: TUsageEndpoint | null
  ) {}

  static fromConfig({ envConfig, isOffline }: TLicenseServerClientConfig): LicenseServerClient {
    // An offline license lives in LICENSE_KEY too, but sending it would break the air gap and leak the signed
    // credential, so stay dormant.
    if (isOffline) return new LicenseServerClient(null, null);
    return new LicenseServerClient(buildBackend(envConfig), buildUsageEndpoint(envConfig));
  }

  // False for unlicensed self-hosted or offline licenses, so callers can skip work that would no-op anyway.
  isEnabled(): boolean {
    return this.backend !== null;
  }

  canReportUsage(): boolean {
    return this.usageEndpoint !== null;
  }

  // Not cached here, the domain caches the plan. Null when the License Server can't be read so the caller
  // falls back.
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

  deleteOrganization(orgId: string) {
    return this.configured().deleteOrganization(orgId);
  }

  async reportSnapshot(orgId: string, snapshot: TUsageSnapshot): Promise<TUsageSnapshotOutcome> {
    if (!this.usageEndpoint) return "reported";
    const body: TUsageSnapshotBody = {
      dimension_key: snapshot.dimensionKey,
      value: snapshot.value,
      observed_at: snapshot.observedAt.toISOString(),
      idempotency_key: `${snapshot.source}:${orgId}:${snapshot.dimensionKey}:${snapshot.observedAt.getTime()}`,
      source: snapshot.source
    };
    try {
      await postUsage(this.usageEndpoint, orgId, "usage-snapshots", { snapshots: [body] });
    } catch (error) {
      if (error instanceof UsageReportError && isLicenseNotFound(error)) return "no-license";
      if (error instanceof UsageReportError && isDimensionNotPriced(error)) return "not-priced";
      throw error;
    }
    return "reported";
  }

  // The server accepts or rejects each request as a whole, so a chunk that fails stops the rest; chunks
  // already sent are safe to resend because of event_id dedup. Any 422, or a 404 "license not found", is the
  // server's final answer for the batch.
  async reportEvents(orgId: string, events: TMeteringEvent[], source: TUsageSource): Promise<TMeteringEventsOutcome> {
    const endpoint = this.usageEndpoint;
    if (!endpoint) return { status: "reported", accepted: 0, deduped: 0 };
    const payload: TUsageEventBody[] = events.map((e) => ({
      event_id: e.eventId,
      dimension_key: e.dimensionKey,
      quantity: e.quantity,
      occurred_at: e.occurredAt,
      source
    }));
    const results: TUsageEventResultBody[] = [];
    try {
      for (let i = 0; i < payload.length; i += MAX_USAGE_EVENTS_PER_REQUEST) {
        const chunk = payload.slice(i, i + MAX_USAGE_EVENTS_PER_REQUEST);
        // eslint-disable-next-line no-await-in-loop
        const body = (await (await postUsage(endpoint, orgId, "usage-events", { events: chunk })).json()) as {
          results?: TUsageEventResultBody[];
        };
        results.push(...(body.results ?? []));
      }
    } catch (error) {
      if (error instanceof UsageReportError && (error.status === 422 || isLicenseNotFound(error))) {
        return { status: "rejected", reason: `${error.status} ${error.serverMessage}`.trim() };
      }
      throw error;
    }
    const deduped = results.filter((r) => r.status === "deduped").length;
    return { status: "reported", accepted: results.length - deduped, deduped };
  }

  private configured(): TLicenseClientBackend {
    if (!this.backend) throw new Error("license client backend is not configured");
    return this.backend;
  }
}
