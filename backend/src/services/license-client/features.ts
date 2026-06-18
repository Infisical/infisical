import { defineFeature, defineLimitFeature } from "./feature";

// Add a constant here when a call site needs to gate on a feature. The key matches a license
// server feature by name; the fallback is served when the server is disabled or unreachable.
export const SsoEnforcement = defineFeature("sso_enforcement", false);
export const AuditRetentionDays = defineFeature("audit_retention_days", 30);

// Metered limit features. Their key is both the resolved cap and the usage meter (see usage/).
export const MaxIdentities = defineLimitFeature("max_identities", 0);
export const MaxInternalCas = defineLimitFeature("max_internal_cas", 0);
export const MaxActiveCerts = defineLimitFeature("max_active_certs", 0);
export const MaxPamResources = defineLimitFeature("max_resources", 0);
