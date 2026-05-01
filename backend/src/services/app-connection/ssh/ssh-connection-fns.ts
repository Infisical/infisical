import { Client, ConnectConfig } from "ssh2";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { SshConnectionMethod } from "./ssh-connection-enums";
import { TSshConnectionConfig } from "./ssh-connection-types";

const SSH_TIMEOUT = 50_000;
const SSH_RETRY_DELAY = 5_000;
const SSH_MAX_RETRIES = 2;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export type TSshConnectionOptions = {
  maxRetries?: number;
  retryDelay?: number;
};

export const getSshConnectionListItem = () => {
  return {
    name: "SSH" as const,
    app: AppConnection.SSH as const,
    methods: Object.values(SshConnectionMethod) as [SshConnectionMethod.Password, SshConnectionMethod.SshKey]
  };
};

const attemptSshConnection = (
  credentials: TSshConnectionConfig,
  targetHost: string,
  targetPort: number
): Promise<Client> => {
  return new Promise((resolve, reject) => {
    const client = new Client();

    const connectConfig: ConnectConfig = {
      host: targetHost,
      port: targetPort,
      readyTimeout: SSH_TIMEOUT,
      tryKeyboard: false,
      algorithms: {
        serverHostKey: ["rsa-sha2-512", "rsa-sha2-256", "ssh-rsa", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp521"]
      }
    };

    client.on("error", (err: Error) => {
      client.destroy();
      if (err instanceof Error) {
        if (
          err.message.includes("authentication") ||
          err.message.includes("All configured authentication methods failed") ||
          err.message.includes("publickey")
        ) {
          reject(new Error("SSH Error: Account credentials invalid."));
          return;
        }

        if (err.message === "Connection timeout") {
          reject(new Error("SSH Error: Connection timeout. Verify that the SSH server is reachable"));
          return;
        }
      }

      reject(new Error(`SSH Error: ${err.message}`));
    });

    client.on("ready", () => {
      resolve(client);
    });

    client.on("timeout", () => {
      client.destroy();
      reject(new Error("SSH Connection Timeout"));
    });

    switch (credentials.method) {
      case SshConnectionMethod.Password: {
        const { credentials: inputCredentials } = credentials;
        connectConfig.username = inputCredentials.username;
        connectConfig.password = inputCredentials.password;
        break;
      }
      case SshConnectionMethod.SshKey: {
        const { credentials: inputCredentials } = credentials;
        connectConfig.username = inputCredentials.username;
        connectConfig.privateKey = inputCredentials.privateKey;
        if (inputCredentials.passphrase) {
          connectConfig.passphrase = inputCredentials.passphrase;
        }
        break;
      }
      default: {
        throw new InternalServerError({
          message: `Unhandled connection method: ${(credentials as { method: string }).method}`
        });
      }
    }

    client.connect(connectConfig);
  });
};

const isRetryableError = (errorMessage: string): boolean => {
  const lowerMessage = errorMessage.toLowerCase();
  return lowerMessage.includes("timeout") || lowerMessage.includes("timed out");
};

export const getSshConnectionClient = async (
  credentials: TSshConnectionConfig,
  targetHost: string,
  targetPort: number,
  options?: TSshConnectionOptions
): Promise<Client> => {
  const maxRetries = options?.maxRetries ?? SSH_MAX_RETRIES;
  const retryDelay = options?.retryDelay ?? SSH_RETRY_DELAY;

  let lastError: Error | null = null;

  // eslint-disable-next-line no-await-in-loop -- Intentional sequential retry logic
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      logger.info(`[host=${targetHost}] [port=${targetPort}] SSH connection attempt ${attempt}/${maxRetries}`);
      // eslint-disable-next-line no-await-in-loop
      const client = await attemptSshConnection(credentials, targetHost, targetPort);
      if (attempt > 1) {
        logger.info(`[host=${targetHost}] [port=${targetPort}] SSH connection succeeded on attempt ${attempt}`);
      }
      return client;
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message ?? "";

      logger.info(
        `[host=${targetHost}] [port=${targetPort}] SSH connection attempt ${attempt} failed: ${errorMessage}`
      );

      if (!isRetryableError(errorMessage)) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        logger.info(`[host=${targetHost}] [port=${targetPort}] Retrying SSH connection in ${retryDelay}ms`);
        // eslint-disable-next-line no-await-in-loop
        await delay(retryDelay);
      }
    }
  }

  throw lastError ?? new Error("SSH connection failed after all retries");
};

export const executeWithPotentialGateway = async <T>(
  config: TSshConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (targetHost: string, targetPort: number) => Promise<T>
): Promise<T> => {
  const { gatewayId, credentials } = config;

  if (gatewayId) {
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
  const { credentials } = config;
  logger.info(`[host=${credentials.host}] [port=${credentials.port}] SSH connection validation: Attempting connection`);

  try {
    await executeWithPotentialGateway(config, gatewayV2Service, async (targetHost, targetPort) => {
      logger.info(`[host=${targetHost}] [port=${targetPort}] SSH connection validation: Connecting`);
      const client = await getSshConnectionClient(config, targetHost, targetPort);
      logger.info(`[host=${targetHost}] [port=${targetPort}] SSH connection validation: Connection successful`);
      client.destroy();
    });

    return config.credentials;
  } catch (error) {
    const errorMessage = (error as Error)?.message ?? "";
    logger.info(
      `[host=${credentials.host}] [port=${credentials.port}] SSH connection validation failed: ${errorMessage}`
    );

    throw new BadRequestError({
      message: `Unable to validate connection: ${errorMessage || "verify credentials"}`
    });
  }
};
