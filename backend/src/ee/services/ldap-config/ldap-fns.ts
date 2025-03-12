import ldapjs from "ldapjs";

import { logger } from "@app/lib/logger";

import { TLDAPConfig } from "./ldap-config-types";

export const isValidLdapFilter = (filter: string) => {
  try {
    ldapjs.parseFilter(filter);
    return true;
  } catch (error) {
    logger.error("Invalid LDAP filter");
    logger.error(error);
    return false;
  }
};

/**
 * Test the LDAP configuration by attempting to bind to the LDAP server
 * @param ldapConfig - The LDAP configuration to test
 * @returns {Boolean} isConnected - Whether or not the connection was successful
 */
export const testLDAPConfig = async (ldapConfig: TLDAPConfig): Promise<boolean> =>
  new Promise((resolve) => {
    const ldapClient = ldapjs.createClient({
      url: ldapConfig.url,
      bindDN: ldapConfig.bindDN,
      bindCredentials: ldapConfig.bindPass,
      ...(ldapConfig.caCert !== ""
        ? {
            tlsOptions: {
              ca: [ldapConfig.caCert]
            }
          }
        : {})
    });

    ldapClient.on("error", (err) => {
      logger.error(err, "LDAP client error");
      resolve(false);
    });

    ldapClient.bind(ldapConfig.bindDN, ldapConfig.bindPass, (err) => {
      if (err) {
        logger.error("Error binding to LDAP");
        logger.error(err);
        ldapClient.unbind();
        resolve(false);
      } else {
        logger.info("Successfully connected and bound to LDAP.");
        ldapClient.unbind();
        resolve(true);
      }
    });
  });

/**
 * Search for groups in the LDAP server
 * @param ldapConfig - The LDAP configuration to use
 * @param filter - The filter to use when searching for groups
 * @param base - The base to search from
 * @returns
 */
export const searchGroups = async (
  ldapConfig: TLDAPConfig,
  filter: string,
  base: string
): Promise<{ dn: string; cn: string }[]> =>
  new Promise((resolve, reject) => {
    const ldapClient = ldapjs.createClient({
      url: ldapConfig.url,
      bindDN: ldapConfig.bindDN,
      bindCredentials: ldapConfig.bindPass,
      ...(ldapConfig.caCert !== ""
        ? {
            tlsOptions: {
              ca: [ldapConfig.caCert]
            }
          }
        : {})
    });

    ldapClient.search(
      base,
      {
        filter,
        scope: "sub"
      },
      (err, res) => {
        if (err) {
          ldapClient.unbind();
          return reject(err);
        }

        const groups: { dn: string; cn: string }[] = [];

        res.on("searchEntry", (entry) => {
          const dn = entry.dn.toString();
          const regex = /cn=([^,]+)/;
          const match = dn.match(regex);
          // parse the cn from the dn
          const cn = (match && match[1]) as string;

          groups.push({ dn, cn });
        });
        res.on("error", (error) => {
          ldapClient.unbind();
          reject(error);
        });
        res.on("end", () => {
          ldapClient.unbind();
          resolve(groups);
        });
      }
    );
  });
