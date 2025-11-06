import ldap from "ldapjs";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { LdapConnectionMethod } from "./ldap-connection-enums";
import { TLdapConnectionConfig } from "./ldap-connection-types";

const parseLdapUrl = (url: string): { protocol: string; host: string; port: number } => {
  const urlObj = new URL(url);
  const isSSL = urlObj.protocol === "ldaps:";
  const defaultPort = isSSL ? 636 : 389;

  return {
    protocol: urlObj.protocol.replace(":", ""),
    host: urlObj.hostname,
    port: urlObj.port ? parseInt(urlObj.port, 10) : defaultPort
  };
};

const constructLdapUrl = (protocol: string, host: string, port: number): string => {
  return `${protocol}://${host}:${port}`;
};

export const getLdapConnectionListItem = () => {
  return {
    name: "LDAP" as const,
    app: AppConnection.LDAP as const,
    methods: Object.values(LdapConnectionMethod) as [LdapConnectionMethod.SimpleBind]
  };
};

const LDAP_TIMEOUT = 15_000;

export const getLdapConnectionClient = async ({
  url,
  dn,
  password,
  sslCertificate,
  sslRejectUnauthorized = true
}: TLdapConnectionConfig["credentials"]) => {
  await blockLocalAndPrivateIpAddresses(url);

  const isSSL = url.startsWith("ldaps");

  return new Promise<ldap.Client>((resolve, reject) => {
    const client = ldap.createClient({
      url,
      timeout: LDAP_TIMEOUT,
      connectTimeout: LDAP_TIMEOUT,
      tlsOptions: isSSL
        ? {
            rejectUnauthorized: sslRejectUnauthorized,
            ca: sslCertificate ? [sslCertificate] : undefined
          }
        : undefined
    });

    client.on("error", (err: Error) => {
      logger.error(err, "LDAP Error");
      client.destroy();
      reject(new Error(`Provider Error - ${err.message}`));
    });

    client.on("connectError", (err: Error) => {
      logger.error(err, "LDAP Connection Error");
      client.destroy();
      reject(new Error(`Provider Connect Error - ${err.message}`));
    });

    client.on("connectRefused", (err: Error) => {
      logger.error(err, "LDAP Connection Refused");
      client.destroy();
      reject(new Error(`Provider Connection Refused - ${err.message}`));
    });

    client.on("connectTimeout", (err: Error) => {
      logger.error(err, "LDAP Connection Timeout");
      client.destroy();
      reject(new Error(`Provider Connection Timeout - ${err.message}`));
    });

    client.on("connect", () => {
      client.bind(dn, password, (err) => {
        if (err) {
          logger.error(err, "LDAP Bind Error");
          reject(new Error(`Bind Error: ${err.message}`));
          client.destroy();
        }

        resolve(client);
      });
    });
  });
};

export const executeWithPotentialGateway = async <T>(
  config: TLdapConnectionConfig,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (client: ldap.Client) => Promise<T>
): Promise<T> => {
  const { gatewayId, credentials } = config;
  const { protocol, host, port } = parseLdapUrl(credentials.url);

  if (gatewayId && gatewayService && gatewayV2Service) {
    const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost: host,
      targetPort: port
    });

    if (platformConnectionDetails) {
      return withGatewayV2Proxy(
        async (proxyPort) => {
          const proxyUrl = constructLdapUrl(protocol, "localhost", proxyPort);
          const isSSL = protocol === "ldaps";
          const client = ldap.createClient({
            url: proxyUrl,
            timeout: LDAP_TIMEOUT,
            connectTimeout: LDAP_TIMEOUT,
            tlsOptions: isSSL
              ? {
                  rejectUnauthorized: sslRejectUnauthorized,
                  ca: sslCertificate ? [sslCertificate] : undefined
                }
              : undefined
          });

          return new Promise<T>((resolve, reject) => {
            client.on("error", (err: Error) => {
              logger.error(err, "LDAP Error");
              client.destroy();
              reject(new Error(`Provider Error - ${err.message}`));
            });

            client.on("connectError", (err: Error) => {
              logger.error(err, "LDAP Connection Error");
              client.destroy();
              reject(new Error(`Provider Connect Error - ${err.message}`));
            });

            client.on("connectRefused", (err: Error) => {
              logger.error(err, "LDAP Connection Refused");
              client.destroy();
              reject(new Error(`Provider Connection Refused - ${err.message}`));
            });

            client.on("connectTimeout", (err: Error) => {
              logger.error(err, "LDAP Connection Timeout");
              client.destroy();
              reject(new Error(`Provider Connection Timeout - ${err.message}`));
            });

            client.on("connect", () => {
              client.bind(credentials.dn, credentials.password, async (err) => {
                if (err) {
                  logger.error(err, "LDAP Bind Error");
                  client.destroy();
                  reject(new Error(`Bind Error: ${err.message}`));
                  return;
                }

                try {
                  const result = await operation(client);
                  resolve(result);
                } catch (opError) {
                  reject(opError);
                } finally {
                  client.destroy();
                }
              });
            });
          });
        },
        {
          protocol: GatewayProxyProtocol.Tcp,
          relayHost: platformConnectionDetails.relayHost,
          gateway: platformConnectionDetails.gateway,
          relay: platformConnectionDetails.relay
        }
      );
    }

    const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(gatewayId);
    const [relayHost, relayPort] = relayDetails.relayAddress.split(":");
    return withGatewayProxy(
      async (proxyPort) => {
        const proxyUrl = constructLdapUrl(protocol, "localhost", proxyPort);
        const isSSL = protocol === "ldaps";
        const client = ldap.createClient({
          url: proxyUrl,
          timeout: LDAP_TIMEOUT,
          connectTimeout: LDAP_TIMEOUT,
          tlsOptions: isSSL
            ? {
                rejectUnauthorized: sslRejectUnauthorized,
                ca: sslCertificate ? [sslCertificate] : undefined
              }
            : undefined
        });
        return new Promise<T>((resolve, reject) => {
          client.on("error", (err: Error) => {
            logger.error(err, "LDAP Error");
            client.destroy();
            reject(new Error(`Provider Error - ${err.message}`));
          });

          client.on("connectError", (err: Error) => {
            logger.error(err, "LDAP Connection Error");
            client.destroy();
            reject(new Error(`Provider Connect Error - ${err.message}`));
          });

          client.on("connectRefused", (err: Error) => {
            logger.error(err, "LDAP Connection Refused");
            client.destroy();
            reject(new Error(`Provider Connection Refused - ${err.message}`));
          });

          client.on("connectTimeout", (err: Error) => {
            logger.error(err, "LDAP Connection Timeout");
            client.destroy();
            reject(new Error(`Provider Connection Timeout - ${err.message}`));
          });

          client.on("connect", () => {
            client.bind(credentials.dn, credentials.password, async (err) => {
              if (err) {
                logger.error(err, "LDAP Bind Error");
                client.destroy();
                reject(new Error(`Bind Error: ${err.message}`));
                return;
              }

              try {
                const result = await operation(client);
                resolve(result);
              } catch (opError) {
                reject(opError);
              } finally {
                client.destroy();
              }
            });
          });
        });
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        targetHost: host,
        targetPort: port,
        relayHost,
        relayPort: Number(relayPort),
        identityId: relayDetails.identityId,
        orgId: relayDetails.orgId,
        tlsOptions: {
          ca: relayDetails.certChain,
          cert: relayDetails.certificate,
          key: relayDetails.privateKey.toString()
        }
      }
    );
  }

  // Non-gateway path - calls getLdapConnectionClient which has validation
  const client = await getLdapConnectionClient(credentials);
  try {
    return await operation(client);
  } finally {
    client.destroy();
  }
};

export const validateLdapConnectionCredentials = async ({ credentials }: TLdapConnectionConfig) => {
  let client: ldap.Client | undefined;

  try {
    client = await getLdapConnectionClient(credentials);

    // this shouldn't occur as handle connection error events in client but here as fallback
    if (!client.connected) {
      throw new BadRequestError({ message: "Unable to connect to LDAP server" });
    }

    return credentials;
  } catch (e: unknown) {
    throw new BadRequestError({
      message: `Unable to validate connection: ${(e as Error).message || "verify credentials"}`
    });
  } finally {
    client?.destroy();
  }
};
