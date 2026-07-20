import { defineFeature, defineLimitFeature } from "./feature";

// Add a constant here when a call site needs to gate on a feature. The key matches a license
// server feature by name; the fallback is served when the server is disabled or unreachable.
export const SsoEnforcement = defineFeature("sso_enforcement", false);
export const AuditRetentionDays = defineFeature("audit_retention_days", 30);

// Metered limit features. Their key is both the resolved cap and the usage meter (see usage/).
export const IdentitiesMeter = defineLimitFeature("identities", 0);
export const InternalCas = defineLimitFeature("internal_cas", 0);
export const ActiveCerts = defineLimitFeature("active_certs", 0);
export const SecretIdentities = defineLimitFeature("secret_identities", 0);
export const PamIdentities = defineLimitFeature("pam_identities", 0);
// Human users (org members), excluding machine identities. For legacy per-user plans that count seats.
export const UserIdentities = defineLimitFeature("user_identities", 0);
