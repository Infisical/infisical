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

// ResourceRef.type is "gateway" only today; the abstraction is in place so relay can be
// added additively in a follow-up PR without renaming routes, audit events
// ("RESOURCE_AUTH_METHOD_*"), or DB tables (resource_auth_methods, resource_aws_auths).
export type ResourceRef = { type: "gateway"; id: string };

export const RESOURCE_TYPE_GATEWAY = "gateway" as const;

// Accepts a wider input than ResourceRef so the runtime guard remains a meaningful check
// (today TS narrows ResourceRef.type to "gateway" at compile time, but this function exists
// so the runtime layer is ready when more resource types are added).
export const assertGatewayResource = (resource: { type: string }, methodName: string) => {
  if (resource.type !== RESOURCE_TYPE_GATEWAY) {
    throw new BadRequestError({
      message: `Resource type "${resource.type}" not supported for ${methodName} auth`
    });
  }
};

// All auth method values surfaced anywhere in the system.
//
//   - 'aws' / 'token' — stored in resource_auth_methods.method, settable via the API.
//   - 'identity'      — legacy state, derived from gateways_v2.identityId. Returned in
//                       the API view but never stored in the registry and never
//                       accepted as input to set/mint operations. The "settable" subset
//                       is enforced by the discriminated TSetAuthMethodInput type
//                       (which only accepts aws/token), not by this enum-like const.
export const ResourceAuthMethodType = {
  Aws: "aws",
  Token: "token",
  Identity: "identity"
} as const;

// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ResourceAuthMethodType = (typeof ResourceAuthMethodType)[keyof typeof ResourceAuthMethodType];
