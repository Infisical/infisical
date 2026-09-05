// Allowlist for the "InfisicalCore" meter. Any attribute not listed is dropped by the SDK View.
// Per-tenant/per-actor ids (org id, user id/email, identity id, ip, user agent, reqId) and free-form
// values (environment slug) are excluded on purpose: they scale series with customer count. Use audit logs.
export const INFISICAL_CORE_METER_ATTRIBUTES = [
  // http.route must be the parameterized template (req.routeOptions.url), not the raw path.
  "http.request.method",
  "http.route",
  "http.response.status_code",
  // Bounded enums
  "infisical.auth.method",
  "infisical.auth.result",
  "queue.name",
  "queue.state",
  "job.name",
  "error.type",
  "outcome",
  "attempts.exhausted",
  "audit_log.event_type",
  "audit_log.actor_type",
  "audit_log.backend",
  "audit_log.drop_reason",
  "product_analytics.event_type",
  "product_analytics.drop_reason",
  "audit_log_stream.provider",
  "audit_log_stream.id",
  "scim.operation",
  "sso.provider",
  "sso.action",
  "email_dispatch.purpose",
  "email_dispatch.mailbox_provider",
  "email_dispatch.address_form",
  "email_dispatch.outcome",
  "email_dispatch.dimension",
  "db.pool.state",
  "pool.max",
  // Closed enums on infisical.legacy_root_key.usage; per-project attribution is in logs, not here.
  "legacy_key.operation",
  "legacy_key.surface",
  "cache.result",
  "cache.if_none_match",
  "cache.etag_miss_reason",
  "rate_limit.bucket",
  "provider",
  "destination",
  "type",
  "operation",
  // Build info gauge labels — single-value per deploy, no cardinality concern
  "service.version",
  "git.commit.sha",
  "node.version"
];

// Every meter that predates the InfisicalCore allowlist. None have a View, so their per-actor / unbounded
// labels (user.email, client.address, syncId, ...) flow through unchanged unless dropped wholesale via
// OTEL_DROP_HIGH_CARDINALITY_METERS. Kept on by default for self-hosted; dropped in multi-tenant/cloud.
export const HIGH_CARDINALITY_METER_NAMES = ["Infisical", "API", "SecretSyncs", "PkiSyncs", "Integrations"];

// Per-instrument series ceiling on the two allowlisted Views. This is the SDK's own default made explicit.
export const METER_AGGREGATION_CARDINALITY_LIMIT = 2000;

// Meter used by @opentelemetry/instrumentation-http for http.server.duration / http.client.duration.
export const HTTP_INSTRUMENTATION_METER_NAME = "@opentelemetry/instrumentation-http";

// HttpInstrumentation reads OTEL_SEMCONV_STABILITY_OPT_IN at construction; default to stable "http".
// Honour explicit "http/dup" unchanged so old and stable HTTP metrics can run side by side during migration.
export const resolveHttpSemconvOptIn = (current?: string): string => {
  const tokens = (current ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.some((token) => token.toLowerCase() === "http/dup")) return tokens.join(",");

  const otherNamespaces = tokens.filter((token) => token.toLowerCase() !== "http");
  return [...otherNamespaces, "http"].join(",");
};

// Allowlist for http.server.duration: bounded labels only; drops unbounded host/peer attrs an upgrade might reintroduce.
export const HTTP_INSTRUMENTATION_METER_ATTRIBUTES = [
  "http.request.method",
  "http.response.status_code",
  "http.route",
  "error.type",
  // Old names for "http/dup" migration; inert under plain "http" but needed so dup'd metrics stay filterable.
  "http.method",
  "http.status_code",
  "http.flavor",
  "http.scheme"
  // net.host.* / net.peer.* omitted on purpose; client-controlled or per-destination, and unbounded.
];
