import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { AuthTokenType } from "@app/services/auth/auth-type";

/**
 * Mints a GATEWAY_ACCESS_TOKEN JWT for a gateway. Same payload shape that the legacy
 * enrollment-token flow produced — kept identical so issued tokens are indistinguishable
 * regardless of which auth method produced them.
 */
export const mintGatewayJwt = ({
  gatewayId,
  orgId,
  tokenVersion,
  accessTokenTTL
}: {
  gatewayId: string;
  orgId: string;
  tokenVersion: number;
  accessTokenTTL: number;
}) => {
  const appCfg = getConfig();
  return crypto.jwt().sign(
    {
      gatewayId,
      orgId,
      authTokenType: AuthTokenType.GATEWAY_ACCESS_TOKEN,
      tokenVersion
    },
    appCfg.AUTH_SECRET,
    accessTokenTTL === 0 ? undefined : { expiresIn: accessTokenTTL }
  );
};

export const mintRelayJwt = ({
  relayId,
  orgId,
  tokenVersion,
  accessTokenTTL
}: {
  relayId: string;
  orgId: string;
  tokenVersion: number;
  accessTokenTTL: number;
}) => {
  const appCfg = getConfig();
  return crypto.jwt().sign(
    {
      relayId,
      orgId,
      authTokenType: AuthTokenType.RELAY_ACCESS_TOKEN,
      tokenVersion
    },
    appCfg.AUTH_SECRET,
    accessTokenTTL === 0 ? undefined : { expiresIn: accessTokenTTL }
  );
};

export const mintKmipServerJwt = ({
  kmipServerId,
  orgId,
  tokenVersion,
  accessTokenTTL
}: {
  kmipServerId: string;
  orgId: string;
  tokenVersion: number;
  accessTokenTTL: number;
}) => {
  const appCfg = getConfig();
  return crypto.jwt().sign(
    {
      kmipServerId,
      orgId,
      authTokenType: AuthTokenType.KMIP_SERVER_ACCESS_TOKEN,
      tokenVersion
    },
    appCfg.AUTH_SECRET,
    accessTokenTTL === 0 ? undefined : { expiresIn: accessTokenTTL }
  );
};

export type ResourceRef =
  | { type: "gateway"; id: string }
  | { type: "relay"; id: string }
  | { type: "kmip"; id: string };

export const RESOURCE_TYPE_GATEWAY = "gateway" as const;
export const RESOURCE_TYPE_RELAY = "relay" as const;
export const RESOURCE_TYPE_KMIP = "kmip" as const;

export const assertGatewayResource = (resource: { type: string }, methodName: string) => {
  if (resource.type !== RESOURCE_TYPE_GATEWAY) {
    throw new BadRequestError({
      message: `Resource type "${resource.type}" not supported for ${methodName} auth`
    });
  }
};

export const assertRelayResource = (resource: { type: string }, methodName: string) => {
  if (resource.type !== RESOURCE_TYPE_RELAY) {
    throw new BadRequestError({
      message: `Resource type "${resource.type}" not supported for ${methodName} auth`
    });
  }
};

export const assertKmipServerResource = (resource: { type: string }, methodName: string) => {
  if (resource.type !== RESOURCE_TYPE_KMIP) {
    throw new BadRequestError({
      message: `Resource type "${resource.type}" not supported for ${methodName} auth`
    });
  }
};

// All auth method values surfaced anywhere in the system.
//
//   - 'aws' / 'kubernetes' / 'token': stored in resource_auth_methods.method and settable
//     via the API.
//   - 'identity': legacy state, derived from gateways_v2.identityId. Returned in the API
//     view but never stored in the registry and never accepted as input to set/mint
//     operations. The "settable" subset is enforced by the discriminated
//     TSetAuthMethodInput type (which only accepts aws/kubernetes/token), not by this
//     enum-like const.
// Reason codes attached to a failed login and recorded on the audit log. Produced here and read
// back in the gateway router, so they need a single definition.
export const ResourceAuthLoginFailureReason = {
  MethodMismatch: "method_mismatch",
  ConfigMissing: "config_missing",
  TokenReviewForbidden: "token_review_forbidden",
  TokenReviewRequestFailed: "token_review_request_failed",
  TokenReviewMalformedResponse: "token_review_malformed_response",
  TokenReviewError: "token_review_error",
  NotAServiceAccount: "not_a_service_account",
  NoAllowlistConfigured: "no_allowlist_configured",
  NamespaceNotAllowed: "namespace_not_allowed",
  NameNotAllowed: "name_not_allowed",
  AudienceNotAllowed: "audience_not_allowed",
  GatewayProxyUnavailable: "gateway_proxy_unavailable"
} as const;

// Who performs the TokenReview. Api means Infisical does, using the configured reviewer token.
// Gateway means the proxying gateway does, using its own in-cluster service account, which needs
// no Kubernetes host or reviewer token but requires that gateway to be a pod in the cluster.
export const KubernetesTokenReviewMode = {
  Api: "api",
  Gateway: "gateway"
} as const;

export type TKubernetesTokenReviewMode = (typeof KubernetesTokenReviewMode)[keyof typeof KubernetesTokenReviewMode];

export const ResourceAuthMethodType = {
  Aws: "aws",
  Kubernetes: "kubernetes",
  Token: "token",
  Identity: "identity"
} as const;

// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ResourceAuthMethodType = (typeof ResourceAuthMethodType)[keyof typeof ResourceAuthMethodType];
