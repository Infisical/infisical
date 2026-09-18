import { InternalServerError } from "@app/lib/errors";

import { TGatewayV2ConnectionDetails } from "../gateway-v2/gateway-v2-types";

export type TResolveGatewayProxyDTO = {
  gatewayV2Id?: string | null;
  gatewayPoolId?: string | null;
  targetHost: string;
  targetPort: number;
};

export type TGatewayProxyResolver = (dto: TResolveGatewayProxyDTO) => Promise<TGatewayV2ConnectionDetails | undefined>;

// Kubernetes auth can route TokenReview traffic through a gateway, but resolving a gateway's proxy
// credentials lives on gatewayV2Service and gatewayPoolService, both of which are constructed after
// resourceAuthMethodService and depend on it. Rather than break that ordering, the resolver is
// registered here after all three exist, the same way alertProviderRegistry is populated.
export const gatewayProxyRegistryFactory = () => {
  let resolver: TGatewayProxyResolver | undefined;

  const register = (fn: TGatewayProxyResolver) => {
    resolver = fn;
  };

  const resolve: TGatewayProxyResolver = async (dto) => {
    if (!resolver) {
      throw new InternalServerError({ message: "Gateway proxy resolver has not been registered" });
    }
    return resolver(dto);
  };

  return { register, resolve };
};

export type TGatewayProxyRegistry = ReturnType<typeof gatewayProxyRegistryFactory>;
