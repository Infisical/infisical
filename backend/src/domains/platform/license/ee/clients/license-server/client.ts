import jwt from "jsonwebtoken";

import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import {
  TLicenseServer,
  TMeteringEvent,
  TMeteringEventsOutcome,
  TUsageSnapshot,
  TUsageSnapshotOutcome,
  TUsageSource
} from "../../../ce/services/dependencies";
import {
  billingProfileResponseSchema,
  catalogResponseSchema,
  checkoutResultSchema,
  cloudPlanResponseSchema,
  confirmTrialPaymentResultSchema,
  entitlementsResponseSchema,
  MAX_USAGE_EVENTS_PER_REQUEST,
  orgDeletedResultSchema,
  sessionResponseSchema,
  subscriptionPreviewResponseSchema,
  subscriptionResponseSchema,
  TBuyProductPayload,
  TCancelTrialPayload,
  TChangeCommitmentsPayload,
  TConfirmTrialPaymentPayload,
  TCreatePortalPayload,
  TEntitlementOrg,
  TEntitlementsResponse,
  TLicenseServerBilling,
  trialCancelResultSchema,
  trialResultSchema,
  trialsResponseSchema,
  TStartTrialPayload,
  TSubscriptionPreviewPayload,
  TSubscriptionResponse,
  TTrialResult,
  TUpgradePayload,
  upgradeResultSchema
} from "../../../ce/services/helpers/license-server-types";
import { TLicenseServerEntitlements } from "../../services/dependencies";
import {
  isDimensionNotPriced,
  isLicenseNotFound,
  licenseErrorMessage,
  readLicenseRequestId,
  throwIfResponseError,
  UsageReportError
} from "./errors";
import { createSelfHostedTokenProvider } from "./token-provider";

export type TLicenseServerClientConfig = {
  envConfig: Pick<
    TEnvConfig,
    "LICENSE_SERVER_V2_SERVICE_KEY" | "LICENSE_SERVER_URL" | "LICENSE_KEY" | "INTERNAL_REGION"
  >;
  isOffline: boolean;
};

// invalidate is set only for a cached token, so a 401 can drop it and retry once with a fresh one.
type TLicenseServerAuth = { getToken: () => Promise<string>; invalidate?: () => void };

export type TLicenseServerConnection = {
  serverUrl: string;
  auth: TLicenseServerAuth;
  // A self-hosted license is one tenant: its key identifies the license, so its reads carry no org and it
  // has no billing.
  isSelfHosted: boolean;
  reportsUsage: boolean;
  region?: string;
};

type TSchema<T> = { parse: (data: unknown) => T };

type TMethod = "GET" | "POST" | "PUT" | "DELETE";

type TSendOptions = {
  query?: Record<string, string | undefined>;
  body?: unknown;
  timeoutMs?: number;
};

type TUsageSnapshotBody = {
  dimension_key: string;
  value: number;
  observed_at: string;
  idempotency_key: string;
  source: string;
};

// One metered fact for a sum or count meter. The license server dedups on event_id, so a retry must
// resend the same id; quantity is ignored for a count meter, which counts each event once.
type TUsageEventBody = {
  event_id: string;
  dimension_key: string;
  quantity: number;
  occurred_at: string;
  source: string;
};

type TUsageEventResultBody = {
  event_id: string;
  status: "accepted" | "deduped";
};

// Issuer/audience/subject match the license server's in-code constants (it validates iss/aud against
// them). They are public claims, not per-deployment config, so they live here rather than in env.
const SERVICE_TOKEN_ISSUER = "infisical-cloud";
const SERVICE_TOKEN_AUDIENCE = "infisical-license-server";
const SERVICE_TOKEN_SUBJECT = "infisical-cloud";
const ORG_DELETED_TIMEOUT_MS = 30_000;

// The license server verifies this short-lived RS256 JWT with our public key, so the private key itself is
// never sent.
const mintServiceToken = (signingKey: string): string =>
  jwt.sign({}, signingKey, {
    algorithm: "RS256",
    issuer: SERVICE_TOKEN_ISSUER,
    audience: SERVICE_TOKEN_AUDIENCE,
    subject: SERVICE_TOKEN_SUBJECT,
    expiresIn: "2m"
  });

const orgScoped = (orgId: string, suffix: string): string => `/v1/organizations/${encodeURIComponent(orgId)}${suffix}`;

const urlProtocol = (url: string): string | null => {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
};

// Usage reports need https outside development, while the other calls also accept http.
const allowsUsageReports = (serverUrl: string): boolean => {
  const protocol = urlProtocol(serverUrl);
  if (protocol === "https:" || (protocol !== null && process.env.NODE_ENV === "development")) return true;
  logger.warn("license-client: LICENSE_SERVER_URL is not a valid https URL; usage reporting disabled");
  return false;
};

const connect = (envConfig: TLicenseServerClientConfig["envConfig"]): TLicenseServerConnection | null => {
  const serverUrl = envConfig.LICENSE_SERVER_URL;
  if (!serverUrl) {
    logger.warn("license-client: LICENSE_SERVER_URL is not set; serving feature fallbacks");
    return null;
  }

  const region = envConfig.INTERNAL_REGION;
  if (envConfig.LICENSE_KEY) {
    return {
      serverUrl,
      auth: createSelfHostedTokenProvider(envConfig.LICENSE_KEY, { serverUrl }),
      isSelfHosted: true,
      reportsUsage: allowsUsageReports(serverUrl),
      region
    };
  }

  const protocol = urlProtocol(serverUrl);
  if (protocol !== "http:" && protocol !== "https:") {
    logger.warn("license-client: LICENSE_SERVER_URL must be a valid http(s) URL; serving feature fallbacks");
    return null;
  }

  const signingKey = envConfig.LICENSE_SERVER_V2_SERVICE_KEY;
  if (!signingKey) {
    logger.warn("license-client: LICENSE_SERVER_V2_SERVICE_KEY is not set; serving feature fallbacks");
    return null;
  }
  // The signing key is a PEM private key; env vars often carry it with escaped newlines.
  const pem = signingKey.replace(/\\n/g, "\n");
  return {
    serverUrl,
    auth: { getToken: async () => mintServiceToken(pem) },
    isSelfHosted: false,
    reportsUsage: allowsUsageReports(serverUrl),
    region
  };
};

const send = async (
  conn: TLicenseServerConnection,
  method: TMethod,
  path: string,
  { query, body, timeoutMs }: TSendOptions = {}
): Promise<Response> => {
  const url = new URL(path, conn.serverUrl);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  const attempt = async () =>
    fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${await conn.auth.getToken()}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
    });

  const res = await attempt();
  if (res.status !== 401 || !conn.auth.invalidate) return res;
  conn.auth.invalidate();
  return attempt();
};

// Throws UsageReportError so the caller can tell a final no from a retryable failure.
const postUsage = async (
  conn: TLicenseServerConnection,
  orgId: string,
  resource: "usage-snapshots" | "usage-events",
  body: unknown
): Promise<Response> => {
  const res = await send(conn, "POST", orgScoped(orgId, `/${resource}`), { body });
  if (res.ok) return res;
  let serverMessage = "";
  try {
    const errBody = (await res.json()) as { message?: string; error?: string };
    serverMessage = errBody?.message ?? errBody?.error ?? "";
  } catch {
    // non-JSON body; leave the message empty
  }
  throw new UsageReportError(res.status, serverMessage, readLicenseRequestId(res));
};

const parseBody = async <T>(res: Response, schema: TSchema<T>): Promise<T> => {
  await throwIfResponseError(res);
  return schema.parse(await res.json());
};

// Dormant when unconfigured or on an offline license: reads return nothing, changes throw.
export class LicenseServerClient implements TLicenseServer, TLicenseServerBilling, TLicenseServerEntitlements {
  constructor(private readonly connection: TLicenseServerConnection | null) {}

  static fromConfig({ envConfig, isOffline }: TLicenseServerClientConfig): LicenseServerClient {
    // An offline license lives in LICENSE_KEY too, but sending it would break the air gap and leak the signed
    // credential, so stay dormant.
    if (isOffline) return new LicenseServerClient(null);
    return new LicenseServerClient(connect(envConfig));
  }

  // False for unlicensed self-hosted or offline licenses, so callers can skip work that would no-op anyway.
  isEnabled(): boolean {
    return this.connection !== null;
  }

  canReportUsage(): boolean {
    return this.connection?.reportsUsage ?? false;
  }

  // Not cached here, the domain caches the plan. Null when the License Server can't be read so the caller
  // falls back.
  async getEntitlements(org: TEntitlementOrg): Promise<TEntitlementsResponse | null> {
    const conn = this.connection;
    if (!conn) return null;
    try {
      const res = conn.isSelfHosted
        ? await send(conn, "GET", "/v1/entitlements", { query: { region: conn.region } })
        : await send(conn, "GET", orgScoped(org.id, "/entitlements"), {
            query: { org_name: org.name, org_slug: org.slug, region: conn.region }
          });
      return await parseBody(res, entitlementsResponseSchema);
    } catch (error) {
      logger.error(error, `license-client: failed to resolve entitlements [orgId=${org.id}]`);
      return null;
    }
  }

  async getCatalog(orgId: string) {
    const conn = this.connection;
    if (!conn) return null;
    const path = conn.isSelfHosted ? "/v1/products" : orgScoped(orgId, "/products");
    return parseBody(await send(conn, "GET", path), catalogResponseSchema);
  }

  // A 404 (no license yet) and a 200 with no status both mean "no subscription". Other failures throw, so a
  // paying org isn't shown the free state during an outage.
  async getSubscription(orgId: string): Promise<TSubscriptionResponse | null> {
    const conn = this.connection;
    if (!conn) return null;
    const path = conn.isSelfHosted ? "/v1/subscription" : orgScoped(orgId, "/subscription");
    const res = await send(conn, "GET", path);
    if (res.status === 404) return null;
    await throwIfResponseError(res);

    const parsed = subscriptionResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      // Never read a schema mismatch as "no subscription" silently: that hides a real, often paid, one behind
      // the free state. Log it so contract drift is visible, then degrade.
      logger.error(
        { err: parsed.error },
        licenseErrorMessage(readLicenseRequestId(res), `/subscription failed schema validation [orgId=${orgId}]`)
      );
      return null;
    }
    return parsed.data.status ? parsed.data : null;
  }

  // A 404 means the org has no license yet, so the usage meter falls back to unknown limits.
  getCloudPlan(orgId: string) {
    return this.billingRead(orgId, "/cloud-plan", cloudPlanResponseSchema, null);
  }

  // An org with no Stripe customer gets 200 with everything empty; a 404 means it has no license at all.
  getBillingProfile(orgId: string) {
    return this.billingRead(orgId, "/billing/profile", billingProfileResponseSchema, null);
  }

  getTrials(orgId: string) {
    return this.billingRead(orgId, "/billing/trials", trialsResponseSchema, { trials: [] });
  }

  createPortal(orgId: string, payload: TCreatePortalPayload) {
    return this.billingRequest("POST", orgId, "/billing/portal-session", sessionResponseSchema, { body: payload });
  }

  previewSubscriptionChange(orgId: string, payload: TSubscriptionPreviewPayload) {
    return this.billingRequest("POST", orgId, "/subscription/preview", subscriptionPreviewResponseSchema, {
      body: payload
    });
  }

  // Region is insert-only on the License Server, read only by the call that creates the license, so every
  // call that can create one (buyProduct, changeCommitments, startTrial) sends it.
  buyProduct(orgId: string, payload: TBuyProductPayload) {
    return this.billingRequest("POST", orgId, "/subscription/products", checkoutResultSchema, {
      body: { ...payload, region: this.connection?.region }
    });
  }

  // Removing the last product cancels the subscription; removing one the org doesn't hold is a no-op.
  removeProduct(orgId: string, productId: string) {
    const suffix = `/subscription/products/${encodeURIComponent(productId)}`;
    return this.billingRequest("DELETE", orgId, suffix, checkoutResultSchema);
  }

  upgradeProduct(orgId: string, payload: TUpgradePayload) {
    return this.billingRequest("POST", orgId, "/subscription/upgrade", upgradeResultSchema, { body: payload });
  }

  changeCommitments(orgId: string, payload: TChangeCommitmentsPayload) {
    return this.billingRequest("PUT", orgId, "/subscription/commitments", checkoutResultSchema, {
      body: { ...payload, region: this.connection?.region }
    });
  }

  async startTrial(orgId: string, payload: TStartTrialPayload): Promise<TTrialResult> {
    const conn = this.billingConnection();
    const res = await send(conn, "POST", orgScoped(orgId, "/billing/trial"), {
      body: {
        product_key: payload.productKey,
        plan_key: payload.planKey,
        email: payload.email,
        name: payload.name,
        declaredUsage: payload.declaredUsage,
        returnUrl: payload.returnUrl,
        region: conn.region
      }
    });
    // 402 is the "awaiting_card" answer, not a failure.
    if (res.status !== 402) await throwIfResponseError(res);
    const parsed = trialResultSchema.parse(await res.json());
    return { outcome: parsed.outcome, cardSetupUrl: parsed.card_setup_url };
  }

  cancelTrial(orgId: string, payload: TCancelTrialPayload) {
    return this.billingRequest("POST", orgId, "/billing/trial/cancel", trialCancelResultSchema, {
      body: { product_key: payload.productKey }
    });
  }

  confirmTrialPayment(orgId: string, payload: TConfirmTrialPaymentPayload) {
    return this.billingRequest("POST", orgId, "/subscription/trials/confirm-payment", confirmTrialPaymentResultSchema, {
      body: { returnUrl: payload.returnUrl }
    });
  }

  // Cancels the subscription right away and closes the org's licenses. The timeout lets the outbox retry a
  // stalled call instead of holding its worker.
  deleteOrganization(orgId: string) {
    return this.billingRequest("DELETE", orgId, "", orgDeletedResultSchema, { timeoutMs: ORG_DELETED_TIMEOUT_MS });
  }

  async reportSnapshot(orgId: string, snapshot: TUsageSnapshot): Promise<TUsageSnapshotOutcome> {
    const conn = this.connection;
    if (!conn?.reportsUsage) return "reported";
    const body: TUsageSnapshotBody = {
      dimension_key: snapshot.dimensionKey,
      value: snapshot.value,
      observed_at: snapshot.observedAt.toISOString(),
      idempotency_key: `${snapshot.source}:${orgId}:${snapshot.dimensionKey}:${snapshot.observedAt.getTime()}`,
      source: snapshot.source
    };
    try {
      await postUsage(conn, orgId, "usage-snapshots", { snapshots: [body] });
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
    const conn = this.connection;
    if (!conn?.reportsUsage) return { status: "reported", accepted: 0, deduped: 0 };
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
        const res = await postUsage(conn, orgId, "usage-events", { events: chunk });
        // eslint-disable-next-line no-await-in-loop
        const body = (await res.json()) as { results?: TUsageEventResultBody[] };
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

  // Billing exists only on cloud: a self-hosted license is managed out of band.
  private billingConnection(): TLicenseServerConnection {
    if (!this.connection) throw new Error("license-client: the License Server is not configured");
    if (this.connection.isSelfHosted)
      throw new Error("license-client: billing isn't available for self-hosted licenses");
    return this.connection;
  }

  private async billingRequest<T>(
    method: TMethod,
    orgId: string,
    suffix: string,
    schema: TSchema<T>,
    options?: TSendOptions
  ): Promise<T> {
    return parseBody(await send(this.billingConnection(), method, orgScoped(orgId, suffix), options), schema);
  }

  // Unconfigured, and a 404 for an org with no license yet, both read as `empty` instead of failing.
  private async billingRead<T, E>(orgId: string, suffix: string, schema: TSchema<T>, empty: E): Promise<T | E> {
    if (!this.connection) return empty;
    const res = await send(this.billingConnection(), "GET", orgScoped(orgId, suffix));
    if (res.status === 404) return empty;
    return parseBody(res, schema);
  }
}
