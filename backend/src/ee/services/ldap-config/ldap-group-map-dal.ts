import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TLdapGroupMapDALFactory = ReturnType<typeof ldapGroupMapDALFactory>;

export const ldapGroupMapDALFactory = (db: TDbClient) => {
  const ldapGroupMapOrm = ormify(db, TableName.LdapGroupMap);

  const findLdapGroupMapsByLdapConfigId = async (ldapConfigId: string) => {
    try {
      const docs = await db
        .replicaNode()(TableName.LdapGroupMap)
        .where(`${TableName.LdapGroupMap}.ldapConfigId`, ldapConfigId)
        .join(TableName.Groups, `${TableName.LdapGroupMap}.groupId`, `${TableName.Groups}.id`)
        .select(selectAllTableCols(TableName.LdapGroupMap))
        .select(
          db.ref("id").withSchema(TableName.Groups).as("groupId"),
          db.ref("name").withSchema(TableName.Groups).as("groupName"),
          db.ref("slug").withSchema(TableName.Groups).as("groupSlug")
        );

      return docs.map((doc) => {
        return {
          id: doc.id,
          ldapConfigId: doc.ldapConfigId,
          ldapGroupCN: doc.ldapGroupCN,
          group: {
            id: doc.groupId,
            name: doc.groupName,
            slug: doc.groupSlug
          }
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "findGroupMaps" });
    }
  };

  return { ...ldapGroupMapOrm, findLdapGroupMapsByLdapConfigId };
};
