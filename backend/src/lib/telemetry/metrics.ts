import { requestContext } from "@fastify/request-context";
import opentelemetry, {
  type Attributes,
  type Counter,
  type Histogram,
  type Meter,
  type MetricOptions
} from "@opentelemetry/api";
import type { Knex } from "knex";

import { classifyError } from "@app/lib/errors/classify";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";

import { getConfig } from "../config/env";

// IMPORTANT: this module is imported (transitively, via instrumentation.ts) BEFORE setupTelemetry()
// installs the global MeterProvider. A meter or instrument acquired at module-load time therefore binds
// to the OpenTelemetry API's no-op provider permanently and silently records nothing. To avoid that we
// resolve the real meter lazily (memoized, on first .add()/.record() — i.e. at request time, after init).
// Observable gauges can't defer to first use (the SDK pulls them), so they're registered at boot in
// registerInfrastructureMetrics(), which runs from main.ts after setupTelemetry().
const meterCache = new Map<string, Meter>();
const resolveMeter = (meterName: string): Meter => {
  let meter = meterCache.get(meterName);
  if (!meter) {
    meter = opentelemetry.metrics.getMeter(meterName);
    meterCache.set(meterName, meter);
  }
  return meter;
};

type LazyMeter = {
  createCounter: (name: string, options?: MetricOptions) => Counter;
  createHistogram: (name: string, options?: MetricOptions) => Histogram;
};

// Returns instrument wrappers whose underlying instrument is created on first use (after init), so it
// binds to the real MeterProvider. Call sites keep using .add()/.record() exactly as before.
const lazyMeter = (meterName: string): LazyMeter => ({
  createCounter: (name, options) => {
    let instrument: Counter | undefined;
    return {
      add: (value: number, attributes?: Attributes) => {
        if (!instrument) instrument = resolveMeter(meterName).createCounter(name, options);
        instrument.add(value, attributes);
      }
    } as Counter;
  },
  createHistogram: (name, options) => {
    let instrument: Histogram | undefined;
    return {
      record: (value: number, attributes?: Attributes) => {
        if (!instrument) instrument = resolveMeter(meterName).createHistogram(name, options);
        instrument.record(value, attributes);
      }
    } as Histogram;
  }
});

// High-cardinality, per-actor meter, kept on by default for self-hosted (where per-actor visibility is
// useful and cardinality is bounded by a single org); dropped in multi-tenant/cloud via
// OTEL_DROP_HIGH_CARDINALITY_METERS. The pre-existing metrics below ship with per-actor labels documented in the docs.
const infisicalMeter = lazyMeter("Infisical");

// The MeterProvider applies a strict attribute allowlist (View in
// instrumentation.ts) to anything emitted here, dropping high-cardinality labels at the SDK level.
const infisicalCoreMeter = lazyMeter("InfisicalCore");

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

// Audit log lifecycle metrics. Wired in audit-log-queue.ts: enqueued when an event is appended to
// the Redis ingest stream, dropped when the request-path push fails, persist duration around the
// batch insert in the unified consumer.
export const auditLogEnqueuedCounter = infisicalCoreMeter.createCounter("infisical.audit_log.enqueued.count", {
  description: "Audit log events appended to the ingest stream for persistence, by event type and actor type.",
  unit: "{event}"
});

export const auditLogPersistDurationHistogram = infisicalCoreMeter.createHistogram(
  "infisical.audit_log.persist.duration",
  {
    description: "Latency of the consumer's batch insert to durable storage (postgres or clickhouse), by outcome.",
    unit: "s"
  }
);

export const auditLogDroppedCounter = infisicalCoreMeter.createCounter("infisical.audit_log.dropped.count", {
  description:
    "Audit log events dropped on the request path because the ingest-stream push failed (at-most-once). Operators should alert on this.",
  unit: "{event}"
});

// Audit log stream metrics. Wired in audit-log-stream-outbox-service.ts drainStream() per provider send.
export const auditLogStreamDeliveryDurationHistogram = infisicalCoreMeter.createHistogram(
  "infisical.audit_log_stream.delivery.duration",
  {
    description: "Per-provider audit log stream delivery latency and attempt count (use _count for delivery volume).",
    unit: "s"
  }
);

// Wired in audit-log-stream-outbox-service.ts. Incremented when stream events are dropped after
// exhausting all delivery retries (there is no DLQ — the events are gone). Operators should alert on this.
export const auditLogStreamDeliveryExhaustedCounter = infisicalCoreMeter.createCounter(
  "infisical.audit_log_stream.delivery.exhausted.count",
  {
    description:
      "Audit log stream events dropped after exhausting all delivery retries, by stream and org. Operators should alert on this.",
    unit: "{event}"
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

// Why an If-None-Match request did not 304.
export enum SecretEtagMissReason {
  FIELD_ABSENT = "field_absent", // no stored ETag field: churned or expired
  VALUE_DIFFERS = "value_differs" // field exists, content hash differs: secrets changed
}

export const secretCacheAccessCounter = infisicalCoreMeter.createCounter("infisical.secret.cache.access.count", {
  description: "Secret cache accesses, labeled by result, whether If-None-Match was sent, and why it missed the 304.",
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

export const recordSecretCacheAccessMetric = (
  result: SecretCacheAccessResult,
  opts?: { hasIfNoneMatch?: boolean; etagMissReason?: SecretEtagMissReason }
) => {
  if (!isTelemetryEnabled()) return;
  const attributes: Record<string, string> = { "cache.result": result };
  if (opts?.hasIfNoneMatch !== undefined) attributes["cache.if_none_match"] = opts.hasIfNoneMatch ? "true" : "false";
  if (opts?.etagMissReason) attributes["cache.etag_miss_reason"] = opts.etagMissReason;
  secretCacheAccessCounter.add(1, attributes);
};

export const recordSecretCacheWriteMetric = (params: { bytes: number; stored: boolean }) => {
  if (!isTelemetryEnabled()) return;
  secretCacheEntryBytesHistogram.record(params.bytes);
  if (!params.stored) {
    secretCacheOversizeSkipCounter.add(1);
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

// -- License Server v2 dual-read (InfisicalCore meter) ----------------------------------------------
export const licenseDualReadDiffCounter = infisicalCoreMeter.createCounter("infisical.license.dual_read.diff.count", {
  description:
    "v1 vs License Server v2 entitlement comparison results, by feature and kind (mismatch/v2_missing/v1_absent/indeterminate). Match results are not counted.",
  unit: "{result}"
});

export const licenseDualReadErrorCounter = infisicalCoreMeter.createCounter("infisical.license.dual_read.error.count", {
  description: "Failures resolving the v2 entitlement set during dual-read comparison, by error type.",
  unit: "{error}"
});

export const recordLicenseDualReadDiff = (params: { feature: string; kind: string }) => {
  if (!isTelemetryEnabled()) return;
  licenseDualReadDiffCounter.add(1, {
    "license.feature": params.feature,
    "license.dual_read.kind": params.kind
  });
};

export const recordLicenseDualReadError = (params: { error?: unknown }) => {
  if (!isTelemetryEnabled()) return;
  const attributes: Record<string, string> = {};
  if (params.error !== undefined) attributes["error.type"] = classifyError(params.error);
  licenseDualReadErrorCounter.add(1, attributes);
};

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
  ssoConfigChangeCounter.add(1, attributes);
};

// -- Secret operation metrics (InfisicalCore meter) ------------------------------------------------
export const secretOperationDurationHistogram = infisicalCoreMeter.createHistogram(
  "infisical.secret.operation.duration",
  {
    description: "Secret operation latency by operation type, outcome, and environment.",
    unit: "s"
  }
);

export const secretWriteCounter = infisicalCoreMeter.createCounter("infisical.secret.write.count", {
  description: "Secret write operations (create/update/delete).",
  unit: "{operation}"
});

export const recordSecretOperationDuration = (params: {
  startTime: number;
  operation: "read" | "write" | "delete";
  outcome: "success" | "failure";
}) => {
  if (!isTelemetryEnabled()) return;
  secretOperationDurationHistogram.record((performance.now() - params.startTime) / 1000, {
    operation: params.operation,
    outcome: params.outcome
  });
};

export const recordSecretWriteMetric = (params: { operation: "create" | "update" | "delete" }) => {
  if (!isTelemetryEnabled()) return;
  secretWriteCounter.add(1, {
    operation: params.operation
  });
};

// -- Secret sync outcome (InfisicalCore meter) ----------------------------------------------------
export const secretSyncOutcomeCounter = infisicalCoreMeter.createCounter("infisical.secret_sync.outcome.count", {
  description:
    "Secret sync attempts by destination, operation, and outcome. Alert on failure ratio > 50% over 15m with >= 10 attempts, grouped by destination.",
  unit: "{attempt}"
});

export const recordSecretSyncOutcomeMetric = (params: {
  destination: string;
  operation: "sync" | "import" | "remove";
  outcome: "success" | "failure";
  attemptsExhausted: boolean;
}) => {
  if (!isTelemetryEnabled()) return;
  secretSyncOutcomeCounter.add(1, {
    destination: params.destination,
    operation: params.operation,
    outcome: params.outcome,
    "attempts.exhausted": String(params.attemptsExhausted)
  });
};

// -- Secret rotation outcome (InfisicalCore meter) --------------------------------------------------
export const secretRotationOutcomeCounter = infisicalCoreMeter.createCounter(
  "infisical.secret_rotation.outcome.count",
  {
    description:
      "Secret rotation attempts by type and outcome. Alert on failure ratio > 50% per type with >= 5 total rotations.",
    unit: "{attempt}"
  }
);

export const recordSecretRotationOutcomeMetric = (params: { type: string; outcome: "success" | "failure" }) => {
  if (!isTelemetryEnabled()) return;
  secretRotationOutcomeCounter.add(1, {
    type: params.type,
    outcome: params.outcome
  });
};

// -- Dynamic secret orphaned lease (InfisicalCore meter) ---------------------------------------------
export const dynamicSecretOrphanedLeaseCounter = infisicalCoreMeter.createCounter(
  "infisical.dynamic_secret.orphaned_lease.count",
  {
    description: "Dynamic secret lease revocation failures by provider. Alert on any value > 0 sustained 60m.",
    unit: "{failure}"
  }
);

export const recordDynamicSecretOrphanedLeaseMetric = (params: { provider: string }) => {
  if (!isTelemetryEnabled()) return;
  dynamicSecretOrphanedLeaseCounter.add(1, {
    provider: params.provider
  });
};

// -- Boot-time observable gauges (InfisicalCore meter) ----------------------------------------------
// Registered once at boot from main.ts with the primary Knex instance. Runs AFTER setupTelemetry() has
// installed the real MeterProvider, so we resolve the real meter directly here (observable gauges can't
// be deferred to first use like counters/histograms — the SDK pulls them on each export).
export const registerInfrastructureMetrics = (db: Knex) => {
  const meter = resolveMeter("InfisicalCore");

  // Build info: constant-value gauge that emits 1 with build identification labels on every export.
  const buildInfoGauge = meter.createObservableGauge("infisical.build.info", {
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

  // Connection pool: reads in-memory tarn pool counters, so it's cheap to observe on every export.
  const dbPoolGauge = meter.createObservableGauge("infisical.db.pool.connections", {
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
