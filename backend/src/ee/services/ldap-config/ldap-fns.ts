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
          reject(err);
        }

        const groups: { dn: string; cn: string }[] = [];

        res.on("searchEntry", (entry) => {
          groups.push({ dn: entry.object.dn, cn: entry.object.cn as string });
        });

        res.on("error", (error) => {
          reject(error);
        });

        res.on("end", () => {
          resolve(groups);
        });
      }
    );
  });
};
