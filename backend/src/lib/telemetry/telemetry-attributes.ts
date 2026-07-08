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
  "audit_log_stream.provider",
  "audit_log_stream.id",
  "scim.operation",
  "sso.provider",
  "sso.action",
  "db.pool.state",
  "cache.result",
  "rate_limit.bucket",
  "provider",
  "destination",
  "type",
  "operation",
  // License Server v2 dual-read comparison (bounded: feature key set + a small set of diff kinds)
  "license.feature",
  "license.dual_read.kind",
  // Build info gauge labels — single-value per deploy, no cardinality concern
  "service.version",
  "git.commit.sha",
  "node.version"
];

// Every meter that predates the InfisicalCore allowlist. None have a View, so their per-actor / unbounded
// labels (user.email, client.address, syncId, ...) flow through unchanged unless dropped wholesale via
// OTEL_DROP_HIGH_CARDINALITY_METERS. Kept on by default for self-hosted; dropped in multi-tenant/cloud.
export const HIGH_CARDINALITY_METER_NAMES = ["Infisical", "API", "SecretSyncs", "PkiSyncs", "Integrations"];
