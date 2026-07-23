import { ActiveCerts, AuditRetentionDays, IdentitiesMeter, InternalCas, SsoEnforcement } from "../../features";
import { TFeatureMapping } from "../dual-read-types";

export const existingDescriptorMappings: TFeatureMapping[] = [
  {
    // v2's `identities` is a usage meter (reported count); the identity cap is a separate v2 feature
    // (max_identity_limit) mapped in limits.ts, so the meter itself maps to no v1 field.
    v2Key: IdentitiesMeter.key,
    v1Field: null,
    extractV1: null
  },
  {
    v2Key: AuditRetentionDays.key,
    v1Field: "auditLogsRetentionDays",
    extractV1: (p) => p.auditLogsRetentionDays
  },
  {
    // v2's sso_enforcement is the general "can enforce SSO" entitlement; v1 has no single field for it
    // (SAML/OIDC enforcement rides on the samlSSO/oidcSSO capabilities, Google on enforceGoogleSSO).
    v2Key: SsoEnforcement.key,
    v1Field: null,
    extractV1: null
  },
  {
    // v2's `internal_cas` is a usage meter; the internal-CA cap is a separate v2 feature
    // (max_internal_cas) mapped in limits.ts, so the meter itself maps to no v1 field.
    v2Key: InternalCas.key,
    v1Field: null,
    extractV1: null
  },
  {
    v2Key: ActiveCerts.key,
    v1Field: null,
    extractV1: null
  }
];
