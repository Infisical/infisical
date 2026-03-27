import ldapjs from "ldapjs";

import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";

import { verifyHostInputValidity } from "../../dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { generatePassword } from "../../secret-rotation-v2/shared/utils";
import { PamResource } from "../pam-resource-enums";
import {
  TPamResourceFactory,
  TPamResourceFactoryRotateAccountCredentials,
  TPamResourceFactoryValidateAccountCredentials,
  TPamResourceInternalMetadata,
  TPostRotateContext
} from "../pam-resource-types";
import { syncDependenciesAfterRotation } from "../shared/dependency-sync-fns";
import { resolveDnsTcp } from "../shared/dns-over-dc";
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
  TPamResourceInternalMetadata
> = (resourceType, connectionDetails, gatewayId, gatewayV2Service) => {
  const ldapProtocol = connectionDetails.useLdaps ? "ldaps" : "ldap";

  const buildLdapTlsOptions = () => {
    if (!connectionDetails.useLdaps) return {};
    return {
      tlsOptions: {
        rejectUnauthorized: connectionDetails.ldapRejectUnauthorized,
        ...(connectionDetails.ldapCaCert && {
          ca: [connectionDetails.ldapCaCert],
          servername: connectionDetails.ldapTlsServerName || connectionDetails.dcAddress
        })
      }
    };
  };

  const validateConnection = async () => {
    if (!gatewayId) throw new BadRequestError({ message: "Gateway is required for connection validation" });

    try {
      await executeWithGateway({ connectionDetails, gatewayId, resourceType }, gatewayV2Service, async (proxyPort) => {
        return new Promise<void>((resolve, reject) => {
          const client = ldapjs.createClient({
            url: `${ldapProtocol}://localhost:${proxyPort}`,
            connectTimeout: EXTERNAL_REQUEST_TIMEOUT,
            timeout: EXTERNAL_REQUEST_TIMEOUT,
            ...buildLdapTlsOptions()
          });

          let clientError: Error | null = null;
          client.on("error", (err: Error) => {
            clientError = err;
            try {
              client.unbind();
            } catch {
              // do nothing
            }
            reject(err);
          });

          // Anonymous bind to verify this is a reachable LDAP server
          client.bind("", "", (err) => {
            if (clientError) return;

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
    if (!gatewayId) throw new BadRequestError({ message: "Gateway is required for credential validation" });

    try {
      await executeWithGateway({ connectionDetails, gatewayId, resourceType }, gatewayV2Service, async (proxyPort) => {
        return new Promise<void>((resolve, reject) => {
          const bindDn = `${credentials.username}@${connectionDetails.domain}`;

          const client = ldapjs.createClient({
            url: `${ldapProtocol}://localhost:${proxyPort}`,
            connectTimeout: EXTERNAL_REQUEST_TIMEOUT,
            timeout: EXTERNAL_REQUEST_TIMEOUT,
            ...buildLdapTlsOptions()
          });

          let clientError: Error | null = null;
          client.on("error", (err: Error) => {
            clientError = err;
            try {
              client.unbind();
            } catch {
              // do nothing
            }
            reject(err);
          });

          client.bind(bindDn, credentials.password, (err) => {
            if (clientError) return;

            if (err) {
              client.unbind();
              logger.warn(err, "[Active Directory Resource Factory] LDAP bind failed during credential validation");
              reject(new Error(`LDAP bind failed: ${err.message}`));
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
  > = async (rotationAccountCredentials, currentCredentials) => {
    if (!gatewayId) throw new BadRequestError({ message: "Gateway is required for AD credential rotation" });

    const newPassword = generatePassword();

    if (!connectionDetails.useLdaps) {
      throw new BadRequestError({
        message: "LDAPS must be enabled on this Active Directory resource to perform password rotation"
      });
    }

    await executeWithGateway({ connectionDetails, gatewayId, resourceType }, gatewayV2Service, async (proxyPort) => {
      return new Promise<void>((resolve, reject) => {
        const client = ldapjs.createClient({
          url: `ldaps://localhost:${proxyPort}`,
          connectTimeout: EXTERNAL_REQUEST_TIMEOUT,
          timeout: EXTERNAL_REQUEST_TIMEOUT,
          ...buildLdapTlsOptions()
        });

        let clientError: Error | null = null;
        client.on("error", (err: Error) => {
          clientError = err;
          try {
            client.unbind();
          } catch {
            // do nothing
          }
          reject(err);
        });

        // Bind as rotation account (admin)
        const bindDn = `${rotationAccountCredentials.username}@${connectionDetails.domain}`;
        client.bind(bindDn, rotationAccountCredentials.password, (bindErr) => {
          if (clientError) return;
          if (bindErr) {
            client.unbind();
            reject(new Error(`Rotation account bind failed: ${bindErr.message}`));
            return;
          }

          // Search for target user's DN by sAMAccountName
          const searchBase = connectionDetails.domain
            .split(".")
            .map((dc) => `DC=${dc}`)
            .join(",");

          client.search(
            searchBase,
            {
              filter: new ldapjs.EqualityFilter({ attribute: "sAMAccountName", value: currentCredentials.username }),
              scope: "sub",
              attributes: ["dn"]
            },
            (searchErr, searchRes) => {
              if (searchErr) {
                client.unbind();
                reject(new Error(`LDAP search failed: ${searchErr.message}`));
                return;
              }

              let userDn: string | null = null;

              searchRes.on("searchEntry", (entry) => {
                userDn = entry.objectName;
              });

              searchRes.on("error", (err) => {
                client.unbind();
                reject(new Error(`LDAP search error: ${err.message}`));
              });

              searchRes.on("end", () => {
                if (!userDn) {
                  client.unbind();
                  reject(new Error(`User '${currentCredentials.username}' not found in AD`));
                  return;
                }

                // Admin reset: use "replace" operation on unicodePwd
                const encodedPassword = Buffer.from(`"${newPassword}"`, "utf16le");
                const change = new ldapjs.Change({
                  operation: "replace",
                  modification: { type: "unicodePwd", values: [encodedPassword] }
                });

                client.modify(userDn, change, (modifyErr) => {
                  client.unbind();
                  if (modifyErr) {
                    reject(new Error(`AD password reset failed: ${modifyErr.message}`));
                  } else {
                    logger.info(
                      `[AD Rotation] Password rotated for domain account [username=${currentCredentials.username}] on [domain=${connectionDetails.domain}]`
                    );
                    resolve();
                  }
                });
              });
            }
          );
        });
      });
    });

    return { username: currentCredentials.username, password: newPassword };
  };

  const postRotate = async (
    accountId: string,
    newCredentials: TActiveDirectoryAccountCredentials,
    projectId: string,
    ctx: TPostRotateContext,
    rotationAccountCredentials: TActiveDirectoryAccountCredentials
  ) => {
    if (!gatewayId) return;

    await syncDependenciesAfterRotation({
      accountId,
      newCredentials,
      projectId,
      ctx,
      gatewayV2Service,
      rotationCredentials: rotationAccountCredentials,
      gatewayId,
      resolveHostname: async (hostname) => {
        // Resolve via DC's DNS through the gateway
        return executeWithGateway(
          { connectionDetails, gatewayId, resourceType, targetPortOverride: 53 },
          gatewayV2Service,
          async (proxyPort) => {
            const ip = await resolveDnsTcp(hostname, proxyPort);
            if (ip) {
              logger.info(`[AD DependencySync] Resolved ${hostname} -> ${ip}`);
              return ip;
            }
            logger.warn(`[AD DependencySync] DNS resolution failed for ${hostname}, using original`);
            return hostname;
          }
        );
      },
      formatWinrmUsername: (rotationUsername) => {
        const netbiosDomain = connectionDetails.domain.split(".")[0].toUpperCase();
        return `${netbiosDomain}\\${rotationUsername}`;
      }
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
    postRotate,
    handleOverwritePreventionForCensoredValues
  };
};
