import { Client, ConnectConfig } from "ssh2";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { SshConnectionMethod } from "./ssh-connection-enums";
import { TSshConnection, TSshConnectionConfig } from "./ssh-connection-types";

const SSH_TIMEOUT = 15_000;

export const getSshConnectionListItem = () => {
  return {
    name: "SSH" as const,
    app: AppConnection.SSH as const,
    methods: Object.values(SshConnectionMethod) as [SshConnectionMethod.Password, SshConnectionMethod.SshKey]
  };
};

export const getSshConnectionClient = async (
  credentials: TSshConnection["credentials"],
  targetHost: string,
  targetPort: number
): Promise<Client> => {
  return new Promise((resolve, reject) => {
    const client = new Client();

    client.on("error", (err: Error) => {
      client.destroy();
      reject(new Error(`SSH Error: ${err.message}`));
    });

    client.on("ready", () => {
      resolve(client);
    });

    client.on("timeout", () => {
      client.destroy();
      reject(new Error("SSH Connection Timeout"));
    });

    const connectConfig: ConnectConfig = {
      host: targetHost,
      port: targetPort,
      username: credentials.username,
      readyTimeout: SSH_TIMEOUT
    };

    // Handle auth method using discriminated union
    if (credentials.authMethod === SshConnectionMethod.Password) {
      connectConfig.password = credentials.password;
    } else {
      connectConfig.privateKey = credentials.privateKey;
      if (credentials.passphrase) {
        connectConfig.passphrase = credentials.passphrase;
      }
    }

    client.connect(connectConfig);
  });
};

export const executeWithPotentialGateway = async <T>(
  config: TSshConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (targetHost: string, targetPort: number) => Promise<T>
): Promise<T> => {
  const { gatewayId, credentials } = config;

  if (gatewayId && gatewayV2Service) {
    await blockLocalAndPrivateIpAddresses(`ssh://${credentials.host}:${credentials.port}`, true);

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
  await blockLocalAndPrivateIpAddresses(`ssh://${credentials.host}:${credentials.port}`, false);
  return operation(credentials.host, credentials.port);
};

export const validateSshConnectionCredentials = async (
  config: TSshConnectionConfig,
  _gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  try {
    await executeWithPotentialGateway(config, gatewayV2Service, async (targetHost, targetPort) => {
      const client = await getSshConnectionClient(config.credentials, targetHost, targetPort);
      client.destroy(); // Clean up after successful connection
    });

    return config.credentials;
  } catch (error) {
    throw new BadRequestError({
      message: `Unable to validate connection: ${(error as Error)?.message ?? "verify credentials"}`
    });
  }
};
