import { requestContext } from "@fastify/request-context";
import opentelemetry from "@opentelemetry/api";
import type { Knex } from "knex";

import { classifyError } from "@app/lib/errors/classify";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";

import { getConfig } from "../config/env";

// Legacy meter — kept for backwards compatibility. The pre-existing metrics below already ship with
// high-cardinality labels documented in the docs.
const infisicalMeter = opentelemetry.metrics.getMeter("Infisical");

// The MeterProvider applies a strict attribute allowlist (View in
// instrumentation.ts) to anything emitted here, dropping high-cardinality labels at the SDK level.
const infisicalCoreMeter = opentelemetry.metrics.getMeter("InfisicalCore");

export enum AuthAttemptAuthMethod {
  EMAIL = "email",
  SAML = "saml",
  OIDC = "oidc",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
  LDAP = "ldap",
  TOKEN_AUTH = "token-auth",
  UNIVERSAL_AUTH = "universal-auth",
  KUBERNETES_AUTH = "kubernetes-auth",
  GCP_AUTH = "gcp-auth",
  ALICLOUD_AUTH = "alicloud-auth",
  AWS_AUTH = "aws-auth",
  AZURE_AUTH = "azure-auth",
  TLS_CERT_AUTH = "tls-cert-auth",
  OCI_AUTH = "oci-auth",
  OIDC_AUTH = "oidc-auth",
  JWT_AUTH = "jwt-auth",
  LDAP_AUTH = "ldap-auth",
  SPIFFE_AUTH = "spiffe-auth"
}

export enum AuthAttemptAuthResult {
  SUCCESS = "success",
  FAILURE = "failure"
}

// -- Legacy instruments (documented public contract; do not change labels) --------------------------

export const authAttemptCounter = infisicalMeter.createCounter("infisical.auth.attempt.count", {
  description: "Authentication attempts (both successful and failed)",
  unit: "{attempt}"
});

export const secretReadCounter = infisicalMeter.createCounter("infisical.secret.read.count", {
  description: "Number of secret read operations",
  unit: "{operation}"
});

export const recordSecretReadMetric = (params: { environment: string; secretPath: string; name?: string }) => {
  const appCfg = getConfig();

  if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
    const attributes: Record<string, string> = {
      "infisical.environment": params.environment,
      "infisical.secret.path": params.secretPath,
      ...(params.name ? { "infisical.secret.name": params.name } : {})
    };

    const orgId = requestContext.get(RequestContextKey.OrgId);
    if (orgId) {
      attributes["infisical.organization.id"] = orgId;
    }

    const orgName = requestContext.get(RequestContextKey.OrgName);
    if (orgName) {
      attributes["infisical.organization.name"] = orgName;
    }

    const projectDetails = requestContext.get(RequestContextKey.ProjectDetails);
    if (projectDetails?.id) {
      attributes["infisical.project.id"] = projectDetails.id;
    }
    if (projectDetails?.name) {
      attributes["infisical.project.name"] = projectDetails.name;
    }

    const userAuthInfo = requestContext.get(RequestContextKey.UserAuthInfo);
    if (userAuthInfo?.userId) {
      attributes["infisical.user.id"] = userAuthInfo.userId;
    }
    if (userAuthInfo?.email) {
      attributes["infisical.user.email"] = userAuthInfo.email;
    }

    const identityAuthInfo = requestContext.get(RequestContextKey.IdentityAuthInfo);
    if (identityAuthInfo?.identityId) {
      attributes["infisical.identity.id"] = identityAuthInfo.identityId;
    }
    if (identityAuthInfo?.identityName) {
      attributes["infisical.identity.name"] = identityAuthInfo.identityName;
    }

    const userAgent = requestContext.get(RequestContextKey.UserAgent);
    if (userAgent) {
      attributes["user_agent.original"] = userAgent;
    }

    const ip = requestContext.get(RequestContextKey.Ip);
    if (ip) {
      attributes["client.address"] = ip;
    }

    secretReadCounter.add(1, attributes);
  }
};

export enum KmipOperationType {
  CREATE = "create",
  GET = "get",
  GET_ATTRIBUTES = "get_attributes",
  ACTIVATE = "activate",
  REVOKE = "revoke",
  DESTROY = "destroy",
  LOCATE = "locate",
  REGISTER = "register"
}

export const kmipOperationCounter = infisicalMeter.createCounter("infisical.kmip.operation.count", {
  description: "Number of KMIP operations performed",
  unit: "{operation}"
});

export const recordKmipOperationMetric = (params: {
  operationType: KmipOperationType;
  orgId: string;
  projectId: string;
  clientId: string;
  objectId?: string;
  objectName?: string;
}) => {
  const appCfg = getConfig();

  if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
    const attributes: Record<string, string> = {
      "infisical.kmip.operation.type": params.operationType,
      "infisical.organization.id": params.orgId,
      "infisical.project.id": params.projectId,
      "infisical.kmip.client.id": params.clientId
    };

    if (params.objectId) {
      attributes["infisical.kmip.object.id"] = params.objectId;
    }

    if (params.objectName) {
      attributes["infisical.kmip.object.name"] = params.objectName;
    }

    const identityAuthInfo = requestContext.get(RequestContextKey.IdentityAuthInfo);
    if (identityAuthInfo?.identityId) {
      attributes["infisical.identity.id"] = identityAuthInfo.identityId;
    }
    if (identityAuthInfo?.identityName) {
      attributes["infisical.identity.name"] = identityAuthInfo.identityName;
    }

    const userAgent = requestContext.get(RequestContextKey.UserAgent);
    if (userAgent) {
      attributes["user_agent.original"] = userAgent;
    }

    const ip = requestContext.get(RequestContextKey.Ip);
    if (ip) {
      attributes["client.address"] = ip;
    }

    kmipOperationCounter.add(1, attributes);
  }
};

// -- New low-cardinality instruments (InfisicalCore meter) ------------------------------------------

const isTelemetryEnabled = () => getConfig().OTEL_TELEMETRY_COLLECTION_ENABLED;

/**
 * Pull only the keys that survive the InfisicalCore View allowlist (see instrumentation.ts):
 * organization.id, project.id. Returns an empty object when no request context is available
 * (e.g. queue workers / cron handlers) — those call sites pass their own tenant labels.
 */
export const buildBaseAttributes = (): Record<string, string> => {
  const attributes: Record<string, string> = {};

  const orgId = requestContext.get(RequestContextKey.OrgId);
  if (orgId) attributes["infisical.organization.id"] = orgId;

  const projectDetails = requestContext.get(RequestContextKey.ProjectDetails);
  if (projectDetails?.id) attributes["infisical.project.id"] = projectDetails.id;

  return attributes;
};

// Queue worker lifecycle metrics. Wired in queue-service.ts via worker.on('completed' | 'failed' | 'stalled').
export const queueJobCounter = infisicalCoreMeter.createCounter("infisical.queue.job.count", {
  description: "Queue jobs processed by outcome (completed or failed)",
  unit: "{job}"
});

export const queueJobDurationHistogram = infisicalCoreMeter.createHistogram("infisical.queue.job.duration", {
  description:
    "Queue job processing duration (worker pickup to completion). Skipped on framework-level failures where processedOn is undefined.",
  unit: "s"
});

export const queueJobWaitHistogram = infisicalCoreMeter.createHistogram("infisical.queue.job.wait", {
  description:
    "Queue job wait time (queue contention only). Subtracts job.opts.delay so intentional scheduling doesn't inflate percentiles.",
  unit: "s"
});

export const queueJobFailureCounter = infisicalCoreMeter.createCounter("infisical.queue.job.failure.count", {
  description:
    "Queue job failures classified by error type. attempts.exhausted=true means all retries are spent (real failure).",
  unit: "{failure}"
});

export const queueStalledCounter = infisicalCoreMeter.createCounter("infisical.queue.stalled.count", {
  description:
    "Stalled queue jobs (lock expired without completing). Strongest signal of a stuck worker / OOM / network partition.",
  unit: "{job}"
});

// Audit log lifecycle metrics. Wired in audit-log-queue.ts at pushToLog / worker handler / failed listener.
export const auditLogEnqueuedCounter = infisicalCoreMeter.createCounter("infisical.audit_log.enqueued.count", {
  description: "Audit log events enqueued for persistence, by event type and actor type.",
  unit: "{event}"
});

export const auditLogPersistDurationHistogram = infisicalCoreMeter.createHistogram(
  "infisical.audit_log.persist.duration",
  {
    description: "Latency from worker pickup to durable storage (postgres or clickhouse).",
    unit: "s"
  }
);

export const auditLogDroppedCounter = infisicalCoreMeter.createCounter("infisical.audit_log.dropped.count", {
  description:
    "Audit log events that failed to persist (max retries / validation / disabled). Operators should alert on this.",
  unit: "{event}"
});

// Audit log stream metrics. Wired in audit-log-stream-service.ts streamLog().
export const auditLogStreamDeliveryDurationHistogram = infisicalCoreMeter.createHistogram(
  "infisical.audit_log_stream.delivery.duration",
  {
    description: "Per-provider audit log stream delivery latency and attempt count (use _count for delivery volume).",
    unit: "s"
  }
);

export const auditLogStreamAlertFiredCounter = infisicalCoreMeter.createCounter(
  "infisical.audit_log_stream.alert.fired.count",
  {
    description: "Times the audit log stream sliding-window failure threshold tripped an admin alert.",
    unit: "{alert}"
  }
);

// Permission cache metrics. Wired in lib/cache/with-cache.ts withCacheFingerprint().
export const permissionCacheLookupCounter = infisicalCoreMeter.createCounter(
  "infisical.permission_cache.lookup.count",
  {
    description: "Permission cache lookups by branch: short-marker hit, fingerprint match, full refetch.",
    unit: "{lookup}"
  }
);

export const permissionCacheFingerprintDurationHistogram = infisicalCoreMeter.createHistogram(
  "infisical.permission_cache.fingerprint.duration",
  {
    description: "Time spent computing the permission fingerprint (lightweight DB read on marker expiry).",
    unit: "s"
  }
);

// Secret service-layer cache metrics. Wired in secret-service.ts at cache read/write boundaries.
export enum SecretCacheAccessResult {
  NOT_MODIFIED = "not_modified",
  HIT = "hit",
  MISS = "miss"
}

export const secretCacheAccessCounter = infisicalCoreMeter.createCounter("infisical.secret.cache.access.count", {
  description: "Secret service-layer cache accesses by outcome (304 not-modified / hit / miss)",
  unit: "{access}"
});

export const secretCacheEntryBytesHistogram = infisicalCoreMeter.createHistogram("infisical.secret.cache.entry.bytes", {
  description: "Encrypted secret cache entry size computed at write time",
  unit: "By"
});

export const secretCacheOversizeSkipCounter = infisicalCoreMeter.createCounter(
  "infisical.secret.cache.oversize_skip.count",
  {
    description: "Secret cache writes skipped because the entry exceeded the max byte cap",
    unit: "{skip}"
  }
);

export const recordSecretCacheAccessMetric = (result: SecretCacheAccessResult) => {
  if (!isTelemetryEnabled()) return;
  secretCacheAccessCounter.add(1, { ...buildBaseAttributes(), "cache.result": result });
};

export const recordSecretCacheWriteMetric = (params: { bytes: number; stored: boolean }) => {
  if (!isTelemetryEnabled()) return;
  const attributes = buildBaseAttributes();
  secretCacheEntryBytesHistogram.record(params.bytes, attributes);
  if (!params.stored) {
    secretCacheOversizeSkipCounter.add(1, attributes);
  }
};

export const coreHttpErrorCounter = infisicalCoreMeter.createCounter("infisical.core.http.error.count", {
  description: "API errors with bounded error classification. Labels limited to InfisicalCore View allowlist.",
  unit: "{error}"
});

// Rate limit metric. Wired in error-handler.ts on RateLimitError.
export const rateLimitExceededCounter = infisicalCoreMeter.createCounter("infisical.rate_limit.exceeded.count", {
  description: "HTTP 429 responses (rate limit exceeded).",
  unit: "{request}"
});

// Build info. Constant-value observable gauge that emits 1 with build identification labels every export.
const buildInfoGauge = infisicalCoreMeter.createObservableGauge("infisical.build.info", {
  description: "Always 1. Labels carry build identification (version, git sha, node version)."
});

buildInfoGauge.addCallback((result) => {
  if (!isTelemetryEnabled()) return;
  result.observe(1, {
    "service.version": process.env.INFISICAL_PLATFORM_VERSION || "unknown",
    "git.commit.sha": process.env.DD_GIT_COMMIT_SHA || "unknown",
    "node.version": process.version
  });
});

// -- Authentication latency (InfisicalCore meter) ---------------------------------------------------
export const authAttemptDurationHistogram = infisicalCoreMeter.createHistogram("infisical.auth.attempt.duration", {
  description:
    "Authentication attempt latency by method and result. External verifications (SAML/OIDC/Kubernetes/cloud) include the IdP/provider network round trip.",
  unit: "s"
});

export const recordAuthAttemptMetric = (params: {
  startTime: number;
  method: AuthAttemptAuthMethod;
  result: AuthAttemptAuthResult;
  error?: unknown;
  orgId?: string;
}) => {
  if (!isTelemetryEnabled()) return;
  const attributes: Record<string, string> = {
    "infisical.auth.method": params.method,
    "infisical.auth.result": params.result
  };
  if (params.error !== undefined) attributes["error.type"] = classifyError(params.error);
  if (params.orgId) attributes["infisical.organization.id"] = params.orgId;
  authAttemptDurationHistogram.record((performance.now() - params.startTime) / 1000, attributes);
};

// Machine identity access token renewals. Distinct from the auth.attempt series (initial login).
export const tokenRenewalCounter = infisicalCoreMeter.createCounter("infisical.auth.token.renewal.count", {
  description: "Machine identity access token renewal attempts by outcome.",
  unit: "{renewal}"
});

export const recordTokenRenewalMetric = (params: {
  outcome: "success" | "failure";
  authMethod?: string;
  error?: unknown;
}) => {
  if (!isTelemetryEnabled()) return;
  const attributes: Record<string, string> = { outcome: params.outcome };
  if (params.authMethod) attributes["infisical.auth.method"] = params.authMethod;
  if (params.error !== undefined) attributes["error.type"] = classifyError(params.error);
  tokenRenewalCounter.add(1, attributes);
};

// -- SCIM provisioning (InfisicalCore meter) --------------------------------------------------------
export enum ScimOperation {
  CreateUser = "create_user",
  UpdateUser = "update_user",
  ReplaceUser = "replace_user",
  DeleteUser = "delete_user",
  CreateGroup = "create_group",
  UpdateGroup = "update_group",
  ReplaceGroup = "replace_group",
  DeleteGroup = "delete_group"
}

export const scimOperationDurationHistogram = infisicalCoreMeter.createHistogram("infisical.scim.operation.duration", {
  description: "SCIM provisioning operation latency by operation type and outcome (use _count for operation volume).",
  unit: "s"
});

export const recordScimOperationMetric = (params: {
  startTime: number;
  operation: ScimOperation;
  outcome: "success" | "failure";
  orgId?: string;
  error?: unknown;
}) => {
  if (!isTelemetryEnabled()) return;
  const attributes: Record<string, string> = {
    "scim.operation": params.operation,
    outcome: params.outcome
  };
  if (params.orgId) attributes["infisical.organization.id"] = params.orgId;
  if (params.error !== undefined) attributes["error.type"] = classifyError(params.error);
  scimOperationDurationHistogram.record((performance.now() - params.startTime) / 1000, attributes);
};

// -- SSO config lifecycle (InfisicalCore meter) -----------------------------------------------------
export enum SsoProvider {
  Saml = "saml",
  Oidc = "oidc",
  Ldap = "ldap"
}

export enum SsoConfigAction {
  Create = "create",
  Update = "update"
}

export const ssoConfigChangeCounter = infisicalCoreMeter.createCounter("infisical.sso.config.change.count", {
  description: "SSO configuration changes (create/update) by provider. Detects unexpected SSO reconfiguration.",
  unit: "{change}"
});

export const recordSsoConfigChangeMetric = (params: {
  provider: SsoProvider;
  action: SsoConfigAction;
  orgId?: string;
}) => {
  if (!isTelemetryEnabled()) return;
  const attributes: Record<string, string> = {
    "sso.provider": params.provider,
    "sso.action": params.action
  };
  if (params.orgId) attributes["infisical.organization.id"] = params.orgId;
  ssoConfigChangeCounter.add(1, attributes);
};

// -- Database connection-pool observable gauge (InfisicalCore meter) --------------------------------
// Registered once at boot from main.ts with the primary Knex instance. Reads in-memory tarn pool
// counters, so it's cheap to observe on every export.
export const registerInfrastructureMetrics = (db: Knex) => {
  const dbPoolGauge = infisicalCoreMeter.createObservableGauge("infisical.db.pool.connections", {
    description: "Knex/tarn connection pool counts by state (used, free, pending).",
    unit: "{connection}"
  });

  dbPoolGauge.addCallback((result) => {
    if (!isTelemetryEnabled()) return;
    const pool = (
      db.client as
        | {
            pool?: {
              numUsed?: () => number;
              numFree?: () => number;
              numPendingAcquires?: () => number;
            };
          }
        | undefined
    )?.pool;
    if (!pool) return;
    result.observe(pool.numUsed?.() ?? 0, { "db.pool.state": "used" });
    result.observe(pool.numFree?.() ?? 0, { "db.pool.state": "free" });
    result.observe(pool.numPendingAcquires?.() ?? 0, { "db.pool.state": "pending" });
  });
};
