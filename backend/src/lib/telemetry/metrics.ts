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

export const resolveCoreMeter = (): Meter => resolveMeter("InfisicalCore");

type LazyMeter = {
  createCounter: (name: string, options?: MetricOptions) => Counter;
  createHistogram: (name: string, options?: MetricOptions) => Histogram;
};

// Recording is fire-and-forget: a measurement is an observation of the work, never a step in it, so
// nothing here may throw into a call site. The SDK can raise on a malformed instrument name or a
// broken exporter, and getConfig() is empty until initEnvConfig() runs, which is reachable from
// anything recording during boot. Swallowing is silent on purpose — the logger is itself initialised
// from config, so reporting the failure here risks throwing a second time from the handler.
const safely = (record: () => void) => {
  try {
    record();
  } catch {
    // metrics must never break the path they observe
  }
};

// Returns instrument wrappers whose underlying instrument is created on first use (after init), so it
// binds to the real MeterProvider. Call sites keep using .add()/.record() exactly as before.
const lazyMeter = (meterName: string): LazyMeter => ({
  createCounter: (name, options) => {
    let instrument: Counter | undefined;
    return {
      add: (value: number, attributes?: Attributes) => {
        safely(() => {
          if (!instrument) instrument = resolveMeter(meterName).createCounter(name, options);
          instrument.add(value, attributes);
        });
      }
    } as Counter;
  },
  createHistogram: (name, options) => {
    let instrument: Histogram | undefined;
    return {
      record: (value: number, attributes?: Attributes) => {
        safely(() => {
          if (!instrument) instrument = resolveMeter(meterName).createHistogram(name, options);
          instrument.record(value, attributes);
        });
      }
    } as Histogram;
  }
});

// Exported so a call site can skip work it would only do to produce a measurement (an extra query,
// a serialization, a size computation). Recording is already gated internally, so this is never
// needed to make a record*Metric call safe.
export const isTelemetryEnabled = () => Boolean(getConfig()?.OTEL_TELEMETRY_COLLECTION_ENABLED);

export const shouldRecordHighCardinalityMetrics = () =>
  isTelemetryEnabled() && !getConfig()?.OTEL_DROP_HIGH_CARDINALITY_METERS;

export const highCardinalityMeter = (meterName: string): LazyMeter => {
  const meter = lazyMeter(meterName);

  return {
    createCounter: (name, options) => {
      const counter = meter.createCounter(name, options);
      return {
        add: (value: number, attributes?: Attributes) => {
          if (!shouldRecordHighCardinalityMetrics()) return;
          counter.add(value, attributes);
        }
      } as Counter;
    },
    createHistogram: (name, options) => {
      const histogram = meter.createHistogram(name, options);
      return {
        record: (value: number, attributes?: Attributes) => {
          if (!shouldRecordHighCardinalityMetrics()) return;
          histogram.record(value, attributes);
        }
      } as Histogram;
    }
  };
};

// High-cardinality, per-actor meter, kept on by default for self-hosted (where per-actor visibility is
// useful and cardinality is bounded by a single org); dropped in multi-tenant/cloud via
// OTEL_DROP_HIGH_CARDINALITY_METERS. The pre-existing metrics below ship with per-actor labels documented in the docs.
const infisicalMeter = highCardinalityMeter("Infisical");

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
  if (shouldRecordHighCardinalityMetrics()) {
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
  if (shouldRecordHighCardinalityMetrics()) {
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

// What the server observed when an If-None-Match request did not 304 (cause is inferred downstream).
export enum SecretEtagMissReason {
  FIELD_ABSENT = "field_absent", // no stored ETag for this (actor, fingerprint, params) key
  VALUE_DIFFERS = "value_differs" // a stored ETag exists but differs from the client's If-None-Match
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

// -- Signup abuse (InfisicalCore meter) -------------------------------------------------------------

export enum SignupMailboxProvider {
  GOOGLE = "google",
  OTHER = "other"
}

export enum SignupAddressForm {
  CANONICAL = "canonical",
  ALIASED = "aliased"
}

export enum SignupOtpOutcome {
  SENT = "sent",
  EXISTING_ACCOUNT = "existing-account",
  MAILBOX_CAPPED = "mailbox-capped",
  CAPTCHA_REJECTED = "captcha-rejected"
}

export enum SignupDistinctDimension {
  SOURCE = "source",
  MAILBOX = "mailbox"
}

export const signupOtpRequestCounter = infisicalCoreMeter.createCounter("infisical.signup.otp.request.count", {
  description: "Signup verification code requests by mailbox provider, address form, and outcome.",
  unit: "{request}"
});

export const signupOtpDistinctCounter = infisicalCoreMeter.createCounter("infisical.signup.otp.distinct.count", {
  description:
    "First sighting of a source host or target mailbox within the current signup-abuse window. Compare against the request count to separate a broad campaign from a burst against a few targets.",
  unit: "{entity}"
});

// Rate limit metric. Wired in error-handler.ts on RateLimitError.
export const rateLimitExceededCounter = infisicalCoreMeter.createCounter("infisical.rate_limit.exceeded.count", {
  description: "HTTP 429 responses (rate limit exceeded).",
  unit: "{request}"
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
    unit: "ms"
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
  secretOperationDurationHistogram.record(performance.now() - params.startTime, {
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

export enum AlertDispatchOutcome {
  // Every channel the run touched delivered.
  DeliverySuccess = "delivery_success",
  // Some channels delivered and at least one did not, so a notification was dropped on the failed
  // channels only. Dedup is per (channel, target), so the next run retries just those channels.
  DeliveryPartial = "delivery_partial",
  // No channel delivered: the whole run dropped.
  DeliveryFailed = "delivery_failed",
  // The alert row is gone by the time the job runs: deleted, or its project soft-deleted.
  AlertNotFound = "alert_not_found",
  // The alert still exists but was disabled between being enqueued and the job running.
  AlertDisabled = "alert_disabled",
  // No provider registered for the alert's resource type (misconfiguration).
  NoProvider = "no_provider",
  // Nothing matched the alert condition in this run.
  NoDueTargets = "no_due_targets",
  // The alert has no enabled channels, so the run is skipped before scanning for targets.
  NoChannels = "no_channels",
  // Every channel in the run was directed (email) with no resolvable recipient — the recipients left
  // the org, or the recipient group emptied out. Customer config drift, not a delivery fault, so it
  // is kept out of delivery_failed and must not alarm.
  NoRecipients = "no_recipients",
  // Targets matched, but every one had already been alerted inside the dedup window.
  AllDeduped = "all_deduped"
}

export const alertDispatchOutcomeCounter = infisicalCoreMeter.createCounter("infisical.alert.dispatch.outcome.count", {
  description:
    "Alert dispatch jobs by alert resource type and outcome. Alarm on delivery_failed + delivery_partial: both mean a channel could not be reached, so a notification was dropped. Watch the delivery_* share of total separately: a persistently low ratio means the cron is enqueueing mostly no-op jobs and should pre-filter instead.",
  unit: "{job}"
});

export const recordAlertDispatchOutcomeMetric = (params: { resourceType: string; outcome: AlertDispatchOutcome }) => {
  if (!isTelemetryEnabled()) return;
  alertDispatchOutcomeCounter.add(1, {
    type: params.resourceType,
    outcome: params.outcome
  });
};

export enum ProductAnalyticsDropReason {
  Retention = "retention",
  Unparseable = "unparseable"
}

export const productAnalyticsPublishedCounter = infisicalCoreMeter.createCounter(
  "infisical.product_analytics.published.count",
  {
    description: "Buffered product analytics events drained from Redis and published to PostHog, by event type.",
    unit: "{event}"
  }
);

export const productAnalyticsDroppedCounter = infisicalCoreMeter.createCounter(
  "infisical.product_analytics.dropped.count",
  {
    description:
      "Buffered product analytics events dropped before reaching PostHog, by event type and reason. Occasional retention drops are tolerable; a sustained rate means the drain is not keeping up and the limits need tweaking.",
    unit: "{event}"
  }
);

export const productAnalyticsBacklogHistogram = infisicalCoreMeter.createHistogram(
  "infisical.product_analytics.shard.backlog",
  {
    description:
      "Entries left in a shard after its drain, by event type. Zero on a healthy run: a backlog that persists across runs is what precedes retention drops and, near the 100k MAXLEN, silent write-path eviction.",
    unit: "{entry}"
  }
);

export const recordProductAnalyticsPublishedMetric = (params: { eventType: string; count: number }) =>
  safely(() => {
    if (!isTelemetryEnabled() || params.count === 0) return;
    productAnalyticsPublishedCounter.add(params.count, { "product_analytics.event_type": params.eventType });
  });

export const recordProductAnalyticsDroppedMetric = (params: {
  eventType: string;
  reason: ProductAnalyticsDropReason;
  count: number;
}) =>
  safely(() => {
    if (!isTelemetryEnabled() || params.count === 0) return;
    productAnalyticsDroppedCounter.add(params.count, {
      "product_analytics.event_type": params.eventType,
      "product_analytics.drop_reason": params.reason
    });
  });

export const recordProductAnalyticsBacklogMetric = (params: { eventType: string; backlog: number }) =>
  safely(() => {
    if (!isTelemetryEnabled()) return;
    productAnalyticsBacklogHistogram.record(params.backlog, {
      "product_analytics.event_type": params.eventType
    });
  });

// -- Boot-time observable gauges (InfisicalCore meter) ----------------------------------------------
// Registered once at boot from main.ts with the primary Knex instance. Runs AFTER setupTelemetry() has
// installed the real MeterProvider, so we resolve the real meter directly here (observable gauges can't
// be deferred to first use like counters/histograms — the SDK pulls them on each export).
export const registerInfrastructureMetrics = (db: Knex) => {
  const meter = resolveCoreMeter();

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

// -- Legacy root-key usage (InfisicalCore meter) -----------------------------------------------------
// The pre-KMS tier pins the instance root encryption key, so it can never be rotated while anything
// still uses it. This counter is the evidence for when that tier can be deleted.
export const legacyRootKeyUsageCounter = infisicalCoreMeter.createCounter("infisical.legacy_root_key.usage", {
  description:
    "Reads and writes that still use the instance root encryption key directly instead of the KMS envelope, by surface."
});

export type LegacyRootKeySurface =
  | "project_bot"
  | "user_private_key"
  | "blind_index"
  | "external_migration"
  | "org_bot"
  | "project_ghost_user";

export const recordLegacyRootKeyUsageMetric = (params: {
  operation: "encrypt" | "decrypt";
  surface: LegacyRootKeySurface;
}) => {
  safely(() => {
    if (!isTelemetryEnabled()) return;
    legacyRootKeyUsageCounter.add(1, {
      "legacy_key.operation": params.operation,
      "legacy_key.surface": params.surface
    });
  });
};
