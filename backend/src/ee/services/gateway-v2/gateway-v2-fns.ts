import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { callTestConnection } from "@app/lib/gateway-v2/test-connection-rpc";

import { verifyHostInputValidity } from "../dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "./gateway-v2-service";

type TGatewayDep = Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;

// runs a connection test against the target via the gateway's test-connection handler
export const testConnectionWithGateway = async (
  targetHost: string,
  targetPort: number,
  gatewayId: string,
  gatewayV2Service: TGatewayDep,
  request: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> => {
  const [host] = await verifyHostInputValidity({ host: targetHost, isGateway: true, isDynamicSecret: false });
  const platform = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost: host,
    targetPort
  });
  if (!platform) throw new BadRequestError({ message: "Unable to connect to gateway" });

  await withGatewayV2Proxy(
    async (proxyPort) => {
      const response = await callTestConnection({ port: proxyPort, body: request, timeoutMs, signal });
      if (!response.ok) throw new Error(response.errorMessage);
    },
    {
      protocol: GatewayProxyProtocol.Discovery,
      relayHost: platform.relayHost,
      gateway: platform.gateway,
      relay: platform.relay
    }
  );
};
