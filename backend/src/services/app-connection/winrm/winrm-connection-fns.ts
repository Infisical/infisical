import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { callWinRmEndpoint, WinRmRpcEndpoint } from "@app/lib/gateway-v2/winrm-rpc";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { WinRMConnectionMethod } from "./winrm-connection-enums";
import { TWinRMConnectionConfig } from "./winrm-connection-types";

export type TWinRMGatewayDeps = {
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

export type TWinRMCredentials = {
  host: string;
  port: number;
  username: string;
  password: string;
  useHttps?: boolean;
  insecure?: boolean;
};

export const getWinRMConnectionListItem = () => ({
  name: "Windows (WinRM)" as const,
  app: AppConnection.WinRM as const,
  methods: Object.values(WinRMConnectionMethod) as [WinRMConnectionMethod.UsernamePassword]
});

/**
 * Runs a single WinRM operation on the gateway that sits inside the customer
 * network. Node cannot perform WinRM message sealing, so delivery always runs on
 * the gateway (Go/masterzen) and a gateway is always required for this connection.
 * The target host/port travel in the signed routing extension; only the transport
 * flags and operation payload go in the request body.
 */
export const executeWinRMGatewayOperation = async <T>(
  args: {
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
    credentials: TWinRMCredentials;
    endpoint: WinRmRpcEndpoint;
    params?: Record<string, unknown>;
  },
  deps: TWinRMGatewayDeps
): Promise<T> => {
  const { gatewayV2Service, gatewayPoolService } = deps;

  if (args.gatewayPoolId && !gatewayPoolService) {
    throw new BadRequestError({ message: "Pool-backed connections require gatewayPoolService at the call site" });
  }

  const gatewayId =
    args.gatewayPoolId && gatewayPoolService
      ? await gatewayPoolService.resolveEffectiveGatewayId({
          gatewayId: args.gatewayId,
          gatewayPoolId: args.gatewayPoolId
        })
      : args.gatewayId;

  if (!gatewayId) {
    throw new BadRequestError({
      message: "Windows (WinRM) connections require a gateway to reach the host."
    });
  }

  const connectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost: args.credentials.host,
    targetPort: args.credentials.port
  });
  if (!connectionDetails) {
    throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
  }

  const response = await withGatewayV2Proxy(
    async (port) =>
      callWinRmEndpoint<T>({
        port,
        endpoint: args.endpoint,
        body: {
          username: args.credentials.username,
          password: args.credentials.password,
          params: {
            useHttps: args.credentials.useHttps ?? false,
            insecure: args.credentials.insecure ?? false,
            ...args.params
          }
        }
      }),
    {
      protocol: GatewayProxyProtocol.WinRm,
      relayHost: connectionDetails.relayHost,
      gateway: connectionDetails.gateway,
      relay: connectionDetails.relay
    }
  );

  if (!response.ok) {
    throw new BadRequestError({ message: `WinRM gateway operation failed: ${response.errorMessage ?? ""}` });
  }
  return response.result;
};

export const validateWinRMConnectionCredentials = async (
  config: TWinRMConnectionConfig,
  _gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  try {
    await executeWinRMGatewayOperation<{ ok: boolean }>(
      {
        gatewayId: config.gatewayId,
        gatewayPoolId: config.gatewayPoolId,
        credentials: config.credentials,
        endpoint: "/v1/test"
      },
      { gatewayV2Service }
    );

    return config.credentials;
  } catch (error) {
    throw new BadRequestError({
      message: `Unable to validate connection: ${
        (error as Error)?.message?.replaceAll(config.credentials.password, "********************") ??
        "verify credentials"
      }`
    });
  }
};
