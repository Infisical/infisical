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

// Takes the built test whole, so the ports its certificate must authorise travel with it. Passing them
// separately meant a caller could omit them and have the gateway refuse a port it was meant to probe.
export const testBuiltConnectionWithGateway = async (
  test: { host: string; port: number; request: Record<string, unknown>; additionalPorts?: number[] },
  gatewayId: string,
  gatewayV2Service: TGatewayDep,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<TestConnectionResponse | null> =>
  testConnectionWithGateway(
    test.host,
    test.port,
    gatewayId,
    gatewayV2Service,
    test.request,
    timeoutMs,
    signal,
    test.additionalPorts
  );

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
