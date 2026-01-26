import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { verifyWindowsCredentials } from "@app/lib/smb-rpc";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { SmbConnectionMethod } from "./smb-connection-enums";
import { TSmbConnectionConfig } from "./smb-connection-types";

export const getSmbConnectionListItem = () => {
  return {
    name: "SMB" as const,
    app: AppConnection.SMB as const,
    methods: Object.values(SmbConnectionMethod) as [SmbConnectionMethod.Credentials]
  };
};

export const executeSmbWithPotentialGateway = async <T>(
  config: TSmbConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (targetHost: string, targetPort: number) => Promise<T>
): Promise<T> => {
  const { gatewayId, credentials } = config;

  if (gatewayId) {
    await blockLocalAndPrivateIpAddresses(`smb://${credentials.host}:${credentials.port}`, true);

    const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost: credentials.host,
      targetPort: credentials.port
    });

    if (!platformConnectionDetails) {
      throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
    }

    return withGatewayV2Proxy(
      async (proxyPort) => {
        return operation("localhost", proxyPort);
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        relayHost: platformConnectionDetails.relayHost,
        gateway: platformConnectionDetails.gateway,
        relay: platformConnectionDetails.relay
      }
    );
  }

  // Non-gateway path - direct connection
  await blockLocalAndPrivateIpAddresses(`smb://${credentials.host}:${credentials.port}`, false);
  return operation(credentials.host, credentials.port);
};

export const validateSmbConnectionCredentials = async (
  config: TSmbConnectionConfig,
  _gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  try {
    await executeSmbWithPotentialGateway(config, gatewayV2Service, async (targetHost, targetPort) => {
      await verifyWindowsCredentials(
        targetHost,
        targetPort,
        config.credentials.username,
        config.credentials.password,
        config.credentials.domain
      );
    });

    return config.credentials;
  } catch (error) {
    throw new BadRequestError({
      message: `Unable to validate connection: ${(error as Error)?.message ?? "verify credentials"}`
    });
  }
};
