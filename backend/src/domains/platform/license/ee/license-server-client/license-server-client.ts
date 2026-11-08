import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import {
  TBuyProductPayload,
  TCancelTrialPayload,
  TChangeCommitmentsPayload,
  TConfirmTrialPaymentPayload,
  TCreatePortalPayload,
  TEntitlementOrg,
  TEntitlementsResponse,
  TStartTrialPayload,
  TSubscriptionPreviewPayload,
  TUpgradePayload
} from "../../ce/service/license-server-types/license-server-types";
import { TUsageEvent, TUsageEventResult, TUsageSnapshot } from "../../ce/service/license-server-types/usage-reports";
import { licenseServerBackend, licenseServerSelfHostedBackend, TLicenseClientBackend } from "./license-server-backends";
import { createSelfHostedTokenProvider } from "./license-token-provider";
import { UsageReporter } from "./usage-reporter";

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

// The License Server over HTTP. Dormant when it is not configured, or when the instance runs on an offline
// license: reads then return nothing and changes are refused.
export class LicenseServerClient {
  constructor(
    private readonly backend: TLicenseClientBackend | null,
    private readonly usageReporter: UsageReporter | null
  ) {}

  static fromConfig({ envConfig, isOffline }: TLicenseServerClientConfig): LicenseServerClient {
    if (isOffline) return new LicenseServerClient(null, null);
    return new LicenseServerClient(buildBackend(envConfig, isOffline), UsageReporter.fromConfig(envConfig));
  }

  // False when no license server is reachable (unlicensed self-hosted, or an offline license), so callers can
  // skip work that would only end in a dormant no-op.
  isEnabled(): boolean {
    return this.backend !== null;
  }

  canReportUsage(): boolean {
    return this.usageReporter !== null;
  }

  // Entitlements are not cached here: the domain caches the plan it projects from them. Returns null when the
  // License Server cannot be read, so the caller falls back. The org's name and slug ride along, keeping the
  // License Server's copy current.
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
    if (!this.usageReporter) return;
    await this.usageReporter.reportSnapshots(orgId, snapshots);
  }

  async reportEvents(orgId: string, events: TUsageEvent[]): Promise<TUsageEventResult[]> {
    if (!this.usageReporter) return [];
    return this.usageReporter.reportEvents(orgId, events);
  }

  private configured(): TLicenseClientBackend {
    if (!this.backend) throw new Error("license client backend is not configured");
    return this.backend;
  }
}
