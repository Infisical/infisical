import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { AdcsRpcEndpoint, callAdcsEndpoint } from "@app/lib/gateway-v2/adcs-rpc";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ADCSConnectionMethod } from "./adcs-connection-enums";
import { TADCSConnectionConfig } from "./adcs-connection-types";

export type TADCSGatewayDeps = {
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

export const getADCSConnectionListItem = () => ({
  name: "ADCS" as const,
  app: AppConnection.ADCS as const,
  methods: Object.values(ADCSConnectionMethod) as [ADCSConnectionMethod.UsernamePassword]
});

/**
 * Runs a single MS-WCCE operation on the gateway that sits inside the customer
 * network. AD CS speaks DCOM, which the control plane cannot reach directly, so
 * a gateway is always required for this connection.
 */
export const executeAdcsGatewayOperation = async <T>(
  args: {
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
    credentials: { host: string; username: string; password: string };
    endpoint: AdcsRpcEndpoint;
    caName?: string;
    params?: Record<string, unknown>;
  },
  deps: TADCSGatewayDeps
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
      message: "ADCS connections require a gateway to reach the certificate authority."
    });
  }

  const connectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost: args.credentials.host,
    targetPort: 0
  });
  if (!connectionDetails) {
    throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
  }

  const response = await withGatewayV2Proxy(
    async (port) =>
      callAdcsEndpoint<T>({
        port,
        endpoint: args.endpoint,
        body: {
          username: args.credentials.username,
          password: args.credentials.password,
          caName: args.caName,
          params: args.params
        }
      }),
    {
      protocol: GatewayProxyProtocol.Adcs,
      relayHost: connectionDetails.relayHost,
      gateway: connectionDetails.gateway,
      relay: connectionDetails.relay
    }
  );

  if (!response.ok) {
    const errorMessage = response.errorMessage ?? "";
    // E_INVALIDARG (0x80070057) from the CA almost always means the CA authority name
    // or the requested template is wrong, rather than a transport-level failure.
    if (errorMessage.includes("E_INVALIDARG") || errorMessage.includes("0x80070057")) {
      throw new BadRequestError({
        message:
          "The certificate authority rejected the request (E_INVALIDARG). Verify the certificate authority name and template are correct for this host."
      });
    }
    throw new BadRequestError({ message: `ADCS gateway operation failed: ${errorMessage}` });
  }
  return response.result;
};

type TAdcsConnectionTarget = {
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  credentials: { host: string; username: string; password: string };
};

/**
 * Returns the caller-supplied CA name, or discovers it from the CA host's registry over the
 * gateway (the CertSvc "Active" value) when omitted. `getTarget` is only invoked when discovery
 * is needed, so callers that already have a CA name pay no gateway/credential cost.
 */
export const resolveAdcsCaName = async (
  caName: string | undefined,
  getTarget: () => Promise<TAdcsConnectionTarget>,
  deps: TADCSGatewayDeps
): Promise<string> => {
  if (caName) return caName;

  const target = await getTarget();
  const discovered = await executeAdcsGatewayOperation<{ caName: string }>(
    { ...target, endpoint: "/v1/discover-ca" },
    deps
  );
  if (!discovered?.caName) {
    throw new BadRequestError({
      message:
        "Could not automatically discover the certificate authority name from the host. Provide the Certificate Authority name explicitly."
    });
  }
  return discovered.caName;
};

export const validateADCSConnectionCredentials = async (
  config: TADCSConnectionConfig,
  _gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  try {
    await executeAdcsGatewayOperation<{ ok: boolean }>(
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
