import {
  AuditRetentionDays,
  MaxActiveCerts,
  MaxIdentities,
  MaxInternalCas,
  MaxPamResources,
  SsoEnforcement
} from "../../features";
import { TFeatureMapping, unlimitedWhenNull } from "../dual-read-types";

export const existingDescriptorMappings: TFeatureMapping[] = [
  {
    v2Key: MaxIdentities.key,
    v1Field: "identityLimit",
    extractV1: (p) => p.identityLimit,
    normalize: unlimitedWhenNull
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
    v2Key: MaxInternalCas.key,
    v1Field: null,
    extractV1: null
  },
  {
    v2Key: MaxActiveCerts.key,
    v1Field: null,
    extractV1: null
  },
  {
    v2Key: MaxPamResources.key,
    v1Field: null,
    extractV1: null
  }
];
