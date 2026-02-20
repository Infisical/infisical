import ldapjs from "ldapjs";

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
  TPamResourceFactoryValidateAccountCredentials,
  TPamResourceMetadata
} from "../pam-resource-types";
import {
  TActiveDirectoryAccountCredentials,
  TActiveDirectoryResourceConnectionDetails
} from "./active-directory-resource-types";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

const executeWithGateway = async <T>(
  config: {
    connectionDetails: TActiveDirectoryResourceConnectionDetails;
    resourceType: PamResource;
    gatewayId: string;
    targetPortOverride?: number;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (proxyPort: number) => Promise<T>
): Promise<T> => {
  const { connectionDetails, gatewayId, targetPortOverride } = config;
  const [targetHost] = await verifyHostInputValidity({
    host: connectionDetails.dcAddress,
    isGateway: true,
    isDynamicSecret: false
  });
  const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost,
    targetPort: targetPortOverride ?? connectionDetails.port
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

export const activeDirectoryResourceFactory: TPamResourceFactory<
  TActiveDirectoryResourceConnectionDetails,
  TActiveDirectoryAccountCredentials,
  TPamResourceMetadata
> = (resourceType, connectionDetails, gatewayId, gatewayV2Service) => {
  const validateConnection = async () => {
    if (!gatewayId) {
      throw new BadRequestError({ message: "Gateway ID is required" });
    }

    try {
      await executeWithGateway({ connectionDetails, gatewayId, resourceType }, gatewayV2Service, async (proxyPort) => {
        return new Promise<void>((resolve, reject) => {
          const client = ldapjs.createClient({
            url: `ldap://localhost:${proxyPort}`,
            connectTimeout: EXTERNAL_REQUEST_TIMEOUT,
            timeout: EXTERNAL_REQUEST_TIMEOUT
          });

          client.on("error", (err: Error) => {
            client.unbind();
            reject(err);
          });

          // Anonymous bind to verify this is a reachable LDAP server
          client.bind("", "", (err) => {
            if (err) {
              // Even if anonymous bind is rejected, an LDAP error response means the server is an LDAP server
              // Only reject if it's a connection-level error (not an LDAP protocol error)
              if (err.name === "ConnectionError" || err.name === "TimeoutError") {
                client.unbind();
                reject(err);
              } else {
                logger.info("[Active Directory Resource Factory] LDAP connection validated (server responded)");
                client.unbind();
                resolve();
              }
            } else {
              logger.info("[Active Directory Resource Factory] LDAP anonymous bind successful");
              client.unbind();
              resolve();
            }
          });
        });
      });
    } catch (error) {
      throw new BadRequestError({
        message: `Unable to validate connection to ${resourceType}: ${(error as Error).message || String(error)}`
      });
    }

    return connectionDetails;
  };

  const validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<
    TActiveDirectoryAccountCredentials
  > = async (credentials) => {
    if (!gatewayId) {
      throw new BadRequestError({ message: "Gateway ID is required" });
    }

    try {
      await executeWithGateway({ connectionDetails, gatewayId, resourceType }, gatewayV2Service, async (proxyPort) => {
        return new Promise<void>((resolve, reject) => {
          // Bind DN uses UPN format: username@domain
          const bindDn = `${credentials.username}@${connectionDetails.domain}`;

          const client = ldapjs.createClient({
            url: `ldap://localhost:${proxyPort}`,
            connectTimeout: EXTERNAL_REQUEST_TIMEOUT,
            timeout: EXTERNAL_REQUEST_TIMEOUT
          });

          client.on("error", (err: Error) => {
            client.unbind();
            reject(err);
          });

          client.bind(bindDn, credentials.password, (err) => {
            if (err) {
              client.unbind();
              reject(new Error("LDAP bind failed: invalid credentials"));
            } else {
              logger.info("[Active Directory Resource Factory] LDAP credential validation successful");
              client.unbind();
              resolve();
            }
          });
        });
      });
    } catch (error) {
      throw new BadRequestError({
        message: `Unable to validate credentials for ${resourceType}: ${(error as Error).message || String(error)}`
      });
    }

    return credentials;
  };

  const rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<
    TActiveDirectoryAccountCredentials
  > = async () => {
    throw new BadRequestError({
      message: "Credential rotation is not yet supported for Active Directory resources"
    });
  };

  const handleOverwritePreventionForCensoredValues = async (
    updatedAccountCredentials: TActiveDirectoryAccountCredentials,
    currentCredentials: TActiveDirectoryAccountCredentials
  ) => {
    if (updatedAccountCredentials.password === "__INFISICAL_UNCHANGED__") {
      return {
        ...updatedAccountCredentials,
        password: currentCredentials.password
      };
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
