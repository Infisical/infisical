import { TDbClient } from "@app/db";
import { IdentityAuthMethod, TableName, TIdentities } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TIdentityDALFactory = ReturnType<typeof identityDALFactory>;

export const identityDALFactory = (db: TDbClient) => {
  const identityOrm = ormify(db, TableName.Identity);

  const getTrustedIpsByAuthMethod = async (identityId: string, authMethod: IdentityAuthMethod) => {
    const authMethodToTableName = {
      [IdentityAuthMethod.TOKEN_AUTH]: TableName.IdentityTokenAuth,
      [IdentityAuthMethod.UNIVERSAL_AUTH]: TableName.IdentityUniversalAuth,
      [IdentityAuthMethod.KUBERNETES_AUTH]: TableName.IdentityKubernetesAuth,
      [IdentityAuthMethod.GCP_AUTH]: TableName.IdentityGcpAuth,
      [IdentityAuthMethod.ALICLOUD_AUTH]: TableName.IdentityAliCloudAuth,
      [IdentityAuthMethod.AWS_AUTH]: TableName.IdentityAwsAuth,
      [IdentityAuthMethod.AZURE_AUTH]: TableName.IdentityAzureAuth,
      [IdentityAuthMethod.TLS_CERT_AUTH]: TableName.IdentityTlsCertAuth,
      [IdentityAuthMethod.OCI_AUTH]: TableName.IdentityOciAuth,
      [IdentityAuthMethod.OIDC_AUTH]: TableName.IdentityOidcAuth,
      [IdentityAuthMethod.JWT_AUTH]: TableName.IdentityJwtAuth,
      [IdentityAuthMethod.LDAP_AUTH]: TableName.IdentityLdapAuth
    } as const;
    const tableName = authMethodToTableName[authMethod];
    if (!tableName) return;
    const data = await db(tableName).where({ identityId }).first();
    if (!data) return;
    return data.accessTokenTrustedIps;
  };

  const getIdentitiesByFilter = async ({
    limit,
    offset,
    searchTerm,
    sortBy
  }: {
    limit: number;
    offset: number;
    searchTerm: string;
    sortBy?: keyof TIdentities;
  }) => {
    try {
      let query = db.replicaNode()(TableName.Identity);

      if (searchTerm) {
        query = query.where((qb) => {
          void qb.whereILike("name", `%${searchTerm}%`);
        });
      }

      if (sortBy) {
        query = query.orderBy(sortBy);
      }

      return await query.limit(limit).offset(offset).select(selectAllTableCols(TableName.Identity));
    } catch (error) {
      throw new DatabaseError({ error, name: "Get identities by filter" });
    }
  };

  return { ...identityOrm, getTrustedIpsByAuthMethod, getIdentitiesByFilter };
};
