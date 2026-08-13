import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { callTestConnection, TestConnectionResponse } from "@app/lib/gateway-v2/test-connection-rpc";

import { verifyHostInputValidity } from "../dynamic-secret/dynamic-secret-fns";
import { HEARTBEAT_BUFFER_SECONDS } from "./gateway-v2-constants";
import { TGatewayV2ServiceFactory } from "./gateway-v2-service";

// The same predicate the dashboard applies (frontend/src/hooks/api/gateways-v2/utils.ts). A heartbeat is
// the last *successful* probe and heartbeatTTL is the gateway's self-reported interval, where 0 is the
// sentinel for "the probe failed", so an absent or zero TTL is unhealthy regardless of the timestamp.
// Keep the two in sync: features that refuse to run against an unreachable gateway have to decide it
// server-side rather than trusting the client to have filtered the picker.
export const isGatewayHealthy = (gateway: { heartbeat?: Date | null; heartbeatTTL?: number | null }): boolean => {
  if (!gateway.heartbeat || !gateway.heartbeatTTL) return false;
  return gateway.heartbeat.getTime() + (gateway.heartbeatTTL + HEARTBEAT_BUFFER_SECONDS) * 1000 > Date.now();
};

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
): Promise<TestConnectionResponse | null> => {
  const [host] = await verifyHostInputValidity({ host: targetHost, isGateway: true, isDynamicSecret: false });

  try {
    const platform = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost: host,
      targetPort
    });
    if (!platform) return null;

    return await withGatewayV2Proxy(
      (proxyPort) => callTestConnection({ port: proxyPort, body: request, timeoutMs, signal }),
      {
        protocol: GatewayProxyProtocol.ConnectionTest,
        relayHost: platform.relayHost,
        gateway: platform.gateway,
        relay: platform.relay
      }
    );
  } catch {
    return null;
  }
};
