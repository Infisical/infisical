import { Client } from "ssh2";

import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";

import { verifyHostInputValidity } from "../../dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { PamResource } from "../pam-resource-enums";
import {
  TPamResourceFactory,
  TPamResourceFactoryRotateAccountCredentials,
  TPamResourceFactoryValidateAccountCredentials
} from "../pam-resource-types";
import { SSHAuthMethod } from "./ssh-resource-enums";
import { TSSHAccountCredentials, TSSHResourceConnectionDetails, TSSHResourceMetadata } from "./ssh-resource-types";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

export const executeWithGateway = async <T>(
  config: {
    connectionDetails: TSSHResourceConnectionDetails;
    resourceType: PamResource;
    gatewayId: string;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (proxyPort: number) => Promise<T>
): Promise<T> => {
  const { connectionDetails, gatewayId } = config;
  const [targetHost] = await verifyHostInputValidity({
    host: connectionDetails.host,
    isGateway: true,
    isDynamicSecret: false
  });
  const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost,
    targetPort: connectionDetails.port
  });

  if (!platformConnectionDetails) {
    throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
  }

  return withGatewayV2Proxy(
    async (proxyPort) => {
      return operation(proxyPort);
    },
    {
      protocol: GatewayProxyProtocol.Tcp,
      relayHost: platformConnectionDetails.relayHost,
      gateway: platformConnectionDetails.gateway,
      relay: platformConnectionDetails.relay
    }
  );
};

export const sshResourceFactory: TPamResourceFactory<
  TSSHResourceConnectionDetails,
  TSSHAccountCredentials,
  TSSHResourceMetadata
> = (resourceType, connectionDetails, gatewayId, gatewayV2Service, _projectId, resourceMetadata) => {
  const validateConnection = async () => {
    try {
      if (!gatewayId) {
        throw new BadRequestError({ message: "Gateway ID is required" });
      }

      await executeWithGateway({ connectionDetails, gatewayId, resourceType }, gatewayV2Service, async (proxyPort) => {
        return new Promise<void>((resolve, reject) => {
          const client = new Client();
          let handshakeComplete = false;

          client.on("error", (err) => {
            logger.info(
              { error: err.message, handshakeComplete },
              "[SSH Resource Factory] SSH client error event received"
            );
            // If we got an authentication error, it means we successfully reached the SSH server
            // and completed the SSH handshake - that's good enough for connection validation
            if (handshakeComplete || err.message.includes("authentication") || err.message.includes("publickey")) {
              logger.info(
                { handshakeComplete, errorMessage: err.message },
                "[SSH Resource Factory] SSH connection validation succeeded (auth error after handshake)"
              );
              client.end();
              resolve();
            } else {
              logger.error(
                { error: err.message, handshakeComplete },
                "[SSH Resource Factory] SSH connection validation failed"
              );
              reject(err);
            }
          });

          client.on("handshake", () => {
            // SSH handshake completed - the server is reachable and responding
            logger.info("[SSH Resource Factory] SSH handshake event received - setting handshakeComplete to true");
            handshakeComplete = true;
            client.end();
            resolve();
          });

          client.on("timeout", () => {
            logger.error("[SSH Resource Factory] SSH connection timeout");
            reject(new Error("Connection timeout"));
          });

          // Attempt connection with a dummy username (we don't care about auth success)
          // The goal is just to verify SSH server is reachable and responding
          client.connect({
            host: "localhost",
            port: proxyPort,
            username: "infisical-connection-test",
            password: "infisical-connection-test-password",
            readyTimeout: EXTERNAL_REQUEST_TIMEOUT,
            tryKeyboard: false,
            // We want to fail fast on auth, we're just testing reachability
            authHandler: () => {
              // If authHandler is called, SSH handshake succeeded
              handshakeComplete = true;
              return false; // Don't continue with auth
            }
          });
        });
      });
      return connectionDetails;
    } catch (error) {
      throw new BadRequestError({
        message: `Unable to validate connection to ${resourceType}: ${(error as Error).message || String(error)}`
      });
    }
  };

  const validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<TSSHAccountCredentials> = async (
    credentials
  ) => {
    try {
      if (!gatewayId) {
        throw new BadRequestError({ message: "Gateway ID is required" });
      }

      await executeWithGateway({ connectionDetails, gatewayId, resourceType }, gatewayV2Service, async (proxyPort) => {
        return new Promise<void>((resolve, reject) => {
          const client = new Client();

          client.on("ready", () => {
            logger.info(
              { username: credentials.username, authMethod: credentials.authMethod },
              "[SSH Resource Factory] SSH authentication successful"
            );
            client.end();
            resolve();
          });

          client.on("error", (err) => {
            logger.error(
              { error: err.message, username: credentials.username, authMethod: credentials.authMethod },
              "[SSH Resource Factory] SSH authentication failed"
            );
            reject(err);
          });

          client.on("timeout", () => {
            logger.error(
              { username: credentials.username, authMethod: credentials.authMethod },
              "[SSH Resource Factory] SSH authentication timeout"
            );
            reject(new Error("Connection timeout"));
          });

          // Build connection config based on auth method
          const baseConfig = {
            host: "localhost",
            port: proxyPort,
            username: credentials.username,
            readyTimeout: EXTERNAL_REQUEST_TIMEOUT
          };

          switch (credentials.authMethod) {
            case SSHAuthMethod.Password:
              client.connect({
                ...baseConfig,
                password: credentials.password,
                tryKeyboard: false
              });
              break;
            case SSHAuthMethod.PublicKey:
              client.connect({
                ...baseConfig,
                privateKey: credentials.privateKey,
                tryKeyboard: false
              });
              break;
            case SSHAuthMethod.Certificate:
              // We cant fully validate the connection since ssh2 doesn't support cert auth
              if (!resourceMetadata) {
                reject(
                  new BadRequestError({
                    message:
                      "SSH CA is not configured for this resource. Please set up the CA first using the SSH CA setup script."
                  })
                );
                return;
              }

              logger.info(
                { username: credentials.username },
                "[SSH Resource Factory] Certificate auth - CA is configured, skipping connection validation"
              );
              resolve();
              break;
            default:
              reject(new Error(`Unsupported SSH auth method: ${(credentials as TSSHAccountCredentials).authMethod}`));
          }
        });
      });
      return credentials;
    } catch (error) {
      if (error instanceof Error) {
        // Check for common authentication failure messages
        if (
          error.message.includes("authentication") ||
          error.message.includes("All configured authentication methods failed") ||
          error.message.includes("publickey")
        ) {
          throw new BadRequestError({
            message: "Account credentials invalid."
          });
        }

        if (error.message === "Connection timeout") {
          throw new BadRequestError({
            message: "Connection timeout. Verify that the SSH server is reachable"
          });
        }
      }

      throw new BadRequestError({
        message: `Unable to validate account credentials for ${resourceType}: ${(error as Error).message || String(error)}`
      });
    }
  };

  const rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<TSSHAccountCredentials> = async (
    rotationAccountCredentials
  ) => {
    return rotationAccountCredentials;
  };

  const handleOverwritePreventionForCensoredValues = async (
    updatedAccountCredentials: TSSHAccountCredentials,
    currentCredentials: TSSHAccountCredentials
  ) => {
    if (updatedAccountCredentials.authMethod !== currentCredentials.authMethod) {
      return updatedAccountCredentials;
    }

    if (
      updatedAccountCredentials.authMethod === SSHAuthMethod.Password &&
      currentCredentials.authMethod === SSHAuthMethod.Password
    ) {
      if (updatedAccountCredentials.password === "__INFISICAL_UNCHANGED__") {
        return {
          ...updatedAccountCredentials,
          password: currentCredentials.password
        };
      }
    }

    if (
      updatedAccountCredentials.authMethod === SSHAuthMethod.PublicKey &&
      currentCredentials.authMethod === SSHAuthMethod.PublicKey
    ) {
      if (updatedAccountCredentials.privateKey === "__INFISICAL_UNCHANGED__") {
        return {
          ...updatedAccountCredentials,
          privateKey: currentCredentials.privateKey
        };
      }
    }

    return updatedAccountCredentials;
  };

  return {
    validateConnection,
    validateAccountCredentials,
    rotateAccountCredentials,
    handleOverwritePreventionForCensoredValues
  };
};
