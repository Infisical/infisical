import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { AuthTokenType } from "@app/services/auth/auth-type";

/**
 * Mints a GATEWAY_ACCESS_TOKEN JWT for a gateway. Same payload shape that the existing
 * enrollment-token flow produces — kept identical so issued tokens are indistinguishable
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
// added additively in a follow-up PR without renaming routes ("/resource-{aws,token}-auth/"),
// audit events ("RESOURCE_AUTH_METHOD_*"), or DB tables. When relay support lands, expand
// the union and add a discriminator column to resource_enrollment_tokens.
export type ResourceRef = { type: "gateway"; id: string };

export const RESOURCE_TYPE_GATEWAY = "gateway" as const;

// Accepts a wider input than ResourceRef so the runtime guard remains a meaningful check
// (today TS narrows ResourceRef.type to "gateway" at compile time, but this function exists
// so the runtime layer is ready when more resource types — e.g. relay — are added).
export const assertGatewayResource = (resource: { type: string }, methodName: string) => {
  if (resource.type !== RESOURCE_TYPE_GATEWAY) {
    throw new BadRequestError({
      message: `Resource type "${resource.type}" not supported for ${methodName} auth`
    });
  }
};
