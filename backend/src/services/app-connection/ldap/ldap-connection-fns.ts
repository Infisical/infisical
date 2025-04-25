import ldap from "ldapjs";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { LdapConnectionMethod } from "./ldap-connection-enums";
import { TLdapConnectionConfig } from "./ldap-connection-types";

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
