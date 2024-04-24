import ldap from "ldapjs";

export const searchGroups = async (
  ldapClient: ldap.Client,
  filter: string,
  base: string
): Promise<{ dn: string; cn: string }[]> => {
  return new Promise((resolve, reject) => {
    ldapClient.search(
      base,
      {
        filter,
        scope: "sub"
      },
      (err, res) => {
        if (err) {
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
          console.error(`error: ${error.message}`);
          reject(error);
        });
        res.on("end", () => {
          resolve(groups);
        });
      }
    );
  });
};
