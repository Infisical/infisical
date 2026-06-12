import { defineFeature, defineLimitFeature } from "./feature";

// Add a constant here when a call site needs to gate on a feature. The key matches a license
// server feature by name; the fallback is served when the server is disabled or unreachable.
export const SsoEnforcement = defineFeature("sso_enforcement", false);
export const MaxIdentities = defineLimitFeature("max_identities", 0);
export const AuditRetentionDays = defineFeature("audit_retention_days", 30);
