import { BadRequestError } from "@app/lib/errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { callSqlRotateCredential, TSqlRpcResponse } from "@app/lib/gateway-v2/sql-rpc";
import { callTestConnection, TestConnectionResponse } from "@app/lib/gateway-v2/test-connection-rpc";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";

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
  signal?: AbortSignal,
  // Ports beyond the primary one that this test is allowed to probe, signed into the client certificate.
  additionalTargetPorts?: number[]
): Promise<TestConnectionResponse | null> => {
  const [host] = await verifyHostInputValidity({ host: targetHost, isGateway: true, isDynamicSecret: false });

  try {
    const platform = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost: host,
      targetPort,
      additionalTargetPorts
    });
    if (!platform) return null;

    return await withGatewayV2Proxy(
      (proxyPort) => callTestConnection({ port: proxyPort, body: request, timeoutMs, signal }),
      {
        protocol: GatewayProxyProtocol.ConnectionTest,
        ...platform
      }
    );
  } catch {
    return null;
  }
};

export const rotateSqlCredentialWithGateway = async (
  targetHost: string,
  targetPort: number,
  gatewayId: string,
  gatewayV2Service: TGatewayDep,
  request: Record<string, unknown>,
  timeoutMs: number
): Promise<TSqlRpcResponse> => {
  const [host] = await verifyHostInputValidity({ host: targetHost, isGateway: true, isDynamicSecret: false });

  const platform = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost: host,
    targetPort
  });
  if (!platform) {
    throw new BadRequestError({ message: "Unable to reach the gateway for this account" });
  }

  return withGatewayV2Proxy((proxyPort) => callSqlRotateCredential({ port: proxyPort, body: request, timeoutMs }), {
    protocol: GatewayProxyProtocol.Sql,
    ...platform
  });
};
