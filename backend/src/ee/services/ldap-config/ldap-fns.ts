import { createPrivateKey, X509Certificate } from "node:crypto";

import ldapjs from "@infisical/ldapjs";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TLDAPConfig, TTestLDAPConfigDTO } from "./ldap-config-types";

export const isValidLdapFilter = (filter: string) => {
  try {
    ldapjs.parseFilter(filter);
    return true;
  } catch (error) {
    logger.error(error, "Invalid LDAP filter");
    return false;
  }
};

type TLdapTlsConfigInput = Pick<TLDAPConfig, "url" | "caCert" | "clientCertificate" | "clientKeyCertificate">;

export const buildLdapTlsOptions = (cfg: TLdapTlsConfigInput) => {
  const tlsOptions: { ca?: string[]; cert?: string; key?: string; servername?: string } = {};

  if (cfg.caCert) {
    try {
      // eslint-disable-next-line no-new
      new X509Certificate(cfg.caCert);
    } catch {
      throw new BadRequestError({
        message: "Invalid CA Certificate. Expected a PEM-encoded X.509 certificate."
      });
    }
    tlsOptions.ca = [cfg.caCert];
  }
  if (cfg.clientCertificate) {
    try {
      // eslint-disable-next-line no-new
      new X509Certificate(cfg.clientCertificate);
    } catch {
      throw new BadRequestError({
        message: "Invalid Client Certificate. Expected a PEM-encoded X.509 certificate."
      });
    }
    tlsOptions.cert = cfg.clientCertificate;
  }
  if (cfg.clientKeyCertificate) {
    try {
      createPrivateKey(cfg.clientKeyCertificate);
    } catch {
      throw new BadRequestError({
        message: "Invalid Client Private Key. Expected a PEM-encoded private key."
      });
    }
    tlsOptions.key = cfg.clientKeyCertificate;
  }

  if (Object.keys(tlsOptions).length === 0) return undefined;

  // SNI is required for mTLS against multi-tenant directories (e.g. Google Workspace Secure LDAP)
  // because @infisical/ldapjs does not propagate it from the URL. Scoped to mTLS only to avoid
  // changing TLS handshake behavior for existing non-mTLS configs.
  if (cfg.clientCertificate || cfg.clientKeyCertificate) {
    try {
      tlsOptions.servername = new URL(cfg.url).hostname;
    } catch {
      // Malformed URL — connection itself will surface the error.
    }
  }

  return tlsOptions;
};

/**
 * Test the LDAP configuration by attempting to bind to the LDAP server
 * @param ldapConfig - The LDAP configuration to test
 * @returns {Boolean} isConnected - Whether or not the connection was successful
 */
export const testLDAPConfig = async (ldapConfig: TTestLDAPConfigDTO): Promise<boolean> => {
  return new Promise((resolve) => {
    const tlsOptions = buildLdapTlsOptions(ldapConfig);
    const ldapClient = ldapjs.createClient({
      url: ldapConfig.url,
      bindDN: ldapConfig.bindDN,
      bindCredentials: ldapConfig.bindPass,
      ...(tlsOptions ? { tlsOptions } : {})
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
};

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
): Promise<{ dn: string; cn: string }[]> => {
  return new Promise((resolve, reject) => {
    const tlsOptions = buildLdapTlsOptions(ldapConfig);
    const ldapClient = ldapjs.createClient({
      url: ldapConfig.url,
      bindDN: ldapConfig.bindDN,
      bindCredentials: ldapConfig.bindPass,
      ...(tlsOptions ? { tlsOptions } : {})
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
          // RFC 4514 attribute type names are case-insensitive; Active Directory
          // returns DNs with uppercase "CN=", so match the prefix case-insensitively.
          const cnStartIndex = dn.toLowerCase().indexOf("cn=");

          if (cnStartIndex !== -1) {
            const valueStartIndex = cnStartIndex + 3;
            const commaIndex = dn.indexOf(",", valueStartIndex);
            const cn = dn.substring(valueStartIndex, commaIndex === -1 ? undefined : commaIndex);
            groups.push({ dn, cn });
          }
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
};
