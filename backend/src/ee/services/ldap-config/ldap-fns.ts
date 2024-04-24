import ldapjs from "ldapjs";

import { logger } from "@app/lib/logger";

import { TLDAPConfig } from "./ldap-config-types";

export const searchGroups = async (
  ldapConfig: TLDAPConfig,
  filter: string,
  base: string
): Promise<{ dn: string; cn: string }[]> => {
  return new Promise((resolve, reject) => {
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
          ldapClient.unbind((unbindError) => {
            if (unbindError) {
              logger.error("Error unbinding LDAP client:", unbindError);
            }
          });
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
          ldapClient.unbind((unbindError) => {
            if (unbindError) {
              logger.error("Error unbinding LDAP client:", unbindError);
            }
          });
          reject(error);
        });
        res.on("end", () => {
          ldapClient.unbind((unbindError) => {
            if (unbindError) {
              logger.error("Error unbinding LDAP client:", unbindError);
            }
          });
          resolve(groups);
        });
      }
    );
  });
};
