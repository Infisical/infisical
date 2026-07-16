import { TFeatureMapping } from "../dual-read-types";

export const accessMappings: TFeatureMapping[] = [
  {
    v2Key: "rbac",
    v1Field: "rbac",
    extractV1: (p) => p.rbac
  },
  {
    v2Key: "groups",
    v1Field: "groups",
    extractV1: (p) => p.groups
  },
  {
    v2Key: "ip_allowlisting",
    v1Field: "ipAllowlisting",
    extractV1: (p) => p.ipAllowlisting
  },
  {
    v2Key: "saml_sso",
    v1Field: "samlSSO",
    extractV1: (p) => p.samlSSO
  },
  {
    v2Key: "oidc_sso",
    v1Field: "oidcSSO",
    extractV1: (p) => p.oidcSSO
  },
  {
    v2Key: "ldap",
    v1Field: "ldap",
    extractV1: (p) => p.ldap
  },
  {
    v2Key: "scim",
    v1Field: "scim",
    extractV1: (p) => p.scim
  },
  {
    v2Key: "enforce_google_sso",
    v1Field: "enforceGoogleSSO",
    extractV1: (p) => p.enforceGoogleSSO
  },
  {
    v2Key: "enforce_mfa",
    v1Field: "enforceMfa",
    extractV1: (p) => p.enforceMfa
  },
  {
    v2Key: "github_org_sync",
    v1Field: "githubOrgSync",
    extractV1: (p) => p.githubOrgSync
  },
  {
    v2Key: "audit_logs",
    v1Field: "auditLogs",
    extractV1: (p) => p.auditLogs
  },
  {
    v2Key: "audit_log_streams",
    v1Field: "auditLogStreams",
    extractV1: (p) => p.auditLogStreams
  }
];
