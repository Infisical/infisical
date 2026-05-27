import { requestContext } from "@fastify/request-context";
import opentelemetry from "@opentelemetry/api";

import { RequestContextKey } from "@app/lib/request-context/request-context-keys";

import { getConfig } from "../config/env";

const infisicalMeter = opentelemetry.metrics.getMeter("Infisical");

export enum AuthAttemptAuthMethod {
  EMAIL = "email",
  SAML = "saml",
  OIDC = "oidc",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
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

export enum SecretCacheAccessResult {
  NOT_MODIFIED = "not_modified",
  HIT = "hit",
  MISS = "miss"
}

export const secretCacheAccessCounter = infisicalMeter.createCounter("infisical.secret.cache.access.count", {
  description: "Secret service-layer cache accesses by outcome (304 not-modified / hit / miss)",
  unit: "{access}"
});

export const secretCacheEntryBytesHistogram = infisicalMeter.createHistogram("infisical.secret.cache.entry.bytes", {
  description: "Encrypted secret cache entry size computed at write time",
  unit: "By"
});

export const secretCacheOversizeSkipCounter = infisicalMeter.createCounter(
  "infisical.secret.cache.oversize_skip.count",
  {
    description: "Secret cache writes skipped because the entry exceeded the max byte cap",
    unit: "{skip}"
  }
);

// Low-cardinality attributes (org + project only) so cache hit-rate stays queryable per project.
const getSecretCacheMetricAttributes = () => {
  const attributes: Record<string, string> = {};

  const orgId = requestContext.get(RequestContextKey.OrgId);
  if (orgId) {
    attributes["infisical.organization.id"] = orgId;
  }

  const projectDetails = requestContext.get(RequestContextKey.ProjectDetails);
  if (projectDetails?.id) {
    attributes["infisical.project.id"] = projectDetails.id;
  }

  return attributes;
};

export const recordSecretCacheAccessMetric = (result: SecretCacheAccessResult) => {
  const appCfg = getConfig();

  if (!appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
    return;
  }

  const attributes = getSecretCacheMetricAttributes();
  attributes["infisical.secret.cache.result"] = result;
  secretCacheAccessCounter.add(1, attributes);
};

export const recordSecretCacheWriteMetric = (params: { bytes: number; stored: boolean }) => {
  const appCfg = getConfig();

  if (!appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
    return;
  }

  const attributes = getSecretCacheMetricAttributes();
  secretCacheEntryBytesHistogram.record(params.bytes, attributes);

  if (!params.stored) {
    secretCacheOversizeSkipCounter.add(1, attributes);
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
