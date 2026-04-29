import { useGetResourceAwsAuth, useGetResourceTokenAuth } from "@app/hooks/api/resourceAuthMethods";

import { GatewayAuthMethod } from "./AuthMethodComponentMap";

/**
 * Resolves which auth methods are attached to a gateway by attempting to fetch each
 * method's config row. A 404 (no row) means "not attached"; a 200 means "attached".
 *
 * When relay support lands, this hook accepts a generic ResourceRef instead of gatewayId.
 */
export const useAttachedAuthMethods = (gatewayId: string) => {
  const aws = useGetResourceAwsAuth({ type: "gateway", id: gatewayId });
  const token = useGetResourceTokenAuth({ type: "gateway", id: gatewayId });

  const attached: GatewayAuthMethod[] = [];
  if (token.data) attached.push("token");
  if (aws.data) attached.push("aws");

  return {
    attached,
    awsConfig: aws.data,
    tokenConfig: token.data,
    isPending: aws.isPending || token.isPending
  };
};
