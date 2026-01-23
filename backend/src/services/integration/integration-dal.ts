import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TIntegrations } from "@app/db/schemas/integrations";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TIntegrationDALFactory = ReturnType<typeof integrationDALFactory>;

export const integrationDALFactory = (db: TDbClient) => {
  const integrationOrm = ormify(db, TableName.Integration);

  const integrationFindQuery = (tx: Knex, filter: Partial<TIntegrations>) =>
    tx(TableName.Integration)
      .where(filter)
      .join(TableName.Environment, `${TableName.Integration}.envId`, `${TableName.Environment}.id`)
      .select(tx.ref("name").withSchema(TableName.Environment).as("envName"))
      .select(tx.ref("slug").withSchema(TableName.Environment).as("envSlug"))
      .select(tx.ref("id").withSchema(TableName.Environment).as("envId"))
      .select(tx.ref("projectId").withSchema(TableName.Environment))
      .select(selectAllTableCols(TableName.Integration));

  const find = async (filter: Partial<TIntegrations>, tx?: Knex) => {
    try {
      const docs = await integrationFindQuery(tx || db.replicaNode(), filter);
      return docs.map(({ envId, envSlug, envName, ...el }) => ({
        ...el,
        environment: {
          id: envId,
          slug: envSlug,
          name: envName
        }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id integrations" });
    }
  };

  const findOne = async (filter: Partial<TIntegrations>, tx?: Knex) => {
    try {
      const doc = await integrationFindQuery(tx || db.replicaNode(), filter).first();
      if (!doc) return;

      const { envName: name, envSlug: slug, envId: id, ...el } = doc;
      return { ...el, environment: { id, name, slug } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one integrations" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await integrationFindQuery(tx || db.replicaNode(), {
        [`${TableName.Integration}.id` as "id"]: id
      }).first();
      if (!doc) return;

      const { envName: name, envSlug: slug, envId, ...el } = doc;
      return { ...el, environment: { id: envId, name, slug } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id integrations" });
    }
  };

  const findByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const integrations = await (tx || db.replicaNode())(TableName.Integration)
        .where(`${TableName.Environment}.projectId`, projectId)
        .join(TableName.Environment, `${TableName.Integration}.envId`, `${TableName.Environment}.id`)
        .select(db.ref("name").withSchema(TableName.Environment).as("envName"))
        .select(db.ref("slug").withSchema(TableName.Environment).as("envSlug"))
        .select(db.ref("id").withSchema(TableName.Environment).as("envId"))
        .select(db.ref("projectId").withSchema(TableName.Environment))
        .select(selectAllTableCols(TableName.Integration));

      return integrations.map(({ envId, envSlug, envName, ...el }) => ({
        ...el,
        envId,
        environment: {
          id: envId,
          slug: envSlug,
          name: envName
        }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByProjectId" });
    }
  };

  // used for syncing secrets
  // this will populate integration auth also
  const findByProjectIdV2 = async (projectId: string, environment: string, tx?: Knex) => {
    const docs = await (tx || db.replicaNode())(TableName.Integration)
      .where(`${TableName.Environment}.projectId`, projectId)
      .where("isActive", true)
      .where(`${TableName.Environment}.slug`, environment)
      .join(TableName.Environment, `${TableName.Integration}.envId`, `${TableName.Environment}.id`)
      .join(TableName.IntegrationAuth, `${TableName.IntegrationAuth}.id`, `${TableName.Integration}.integrationAuthId`)
      .select(db.ref("name").withSchema(TableName.Environment).as("envName"))
      .select(db.ref("slug").withSchema(TableName.Environment).as("envSlug"))
      .select(db.ref("id").withSchema(TableName.Environment).as("envId"))
      .select(db.ref("projectId").withSchema(TableName.Environment))
      .select(selectAllTableCols(TableName.Integration))
      .select(
        db.ref("id").withSchema(TableName.IntegrationAuth).as("idAu"),
        db.ref("integration").withSchema(TableName.IntegrationAuth).as("integrationAu"),
        db.ref("teamId").withSchema(TableName.IntegrationAuth).as("teamIdAu"),
        db.ref("url").withSchema(TableName.IntegrationAuth).as("urlAu"),
        db.ref("namespace").withSchema(TableName.IntegrationAuth).as("namespaceAu"),
        db.ref("accountId").withSchema(TableName.IntegrationAuth).as("accountIdAu"),
        db.ref("refreshCiphertext").withSchema(TableName.IntegrationAuth).as("refreshCiphertextAu"),
        db.ref("refreshIV").withSchema(TableName.IntegrationAuth).as("refreshIVAu"),
        db.ref("refreshTag").withSchema(TableName.IntegrationAuth).as("refreshTagAu"),
        db.ref("accessIdCiphertext").withSchema(TableName.IntegrationAuth).as("accessIdCiphertextAu"),
        db.ref("accessIdIV").withSchema(TableName.IntegrationAuth).as("accessIdIVAu"),
        db.ref("accessIdTag").withSchema(TableName.IntegrationAuth).as("accessIdTagAu"),
        db.ref("accessIV").withSchema(TableName.IntegrationAuth).as("accessIVAu"),
        db.ref("accessTag").withSchema(TableName.IntegrationAuth).as("accessTagAu"),
        db.ref("accessCiphertext").withSchema(TableName.IntegrationAuth).as("accessCiphertextAu"),
        db.ref("accessExpiresAt").withSchema(TableName.IntegrationAuth).as("accessExpiresAtAu"),
        db.ref("metadata").withSchema(TableName.IntegrationAuth).as("metadataAu"),
        db.ref("algorithm").withSchema(TableName.IntegrationAuth).as("algorithmAu"),
        db.ref("keyEncoding").withSchema(TableName.IntegrationAuth).as("keyEncodingAu"),
        db.ref("awsAssumeIamRoleArnCipherText").withSchema(TableName.IntegrationAuth),
        db.ref("awsAssumeIamRoleArnIV").withSchema(TableName.IntegrationAuth),
        db.ref("awsAssumeIamRoleArnTag").withSchema(TableName.IntegrationAuth),
        db.ref("encryptedRefresh").withSchema(TableName.IntegrationAuth),
        db.ref("encryptedAccess").withSchema(TableName.IntegrationAuth),
        db.ref("encryptedAccessId").withSchema(TableName.IntegrationAuth),
        db.ref("encryptedAwsAssumeIamRoleArn").withSchema(TableName.IntegrationAuth)
      );
    return docs.map(
      ({
        envId,
        envName,
        envSlug,
        idAu: id,
        integrationAu: integration,
        teamIdAu: teamId,
        urlAu: url,
        namespaceAu: namespace,
        accountIdAu: accountId,
        refreshIVAu: refreshIV,
        refreshCiphertextAu: refreshCiphertext,
        refreshTagAu: refreshTag,
        accessIVAu: accessIV,
        accessCiphertextAu: accessCiphertext,
        accessTagAu: accessTag,
        accessIdIVAu: accessIdIV,
        accessIdTagAu: accessIdTag,
        accessIdCiphertextAu: accessIdCiphertext,
        metadataAu: metadata,
        algorithmAu: algorithm,
        keyEncodingAu: keyEncoding,
        accessExpiresAtAu: accessExpiresAt,
        awsAssumeIamRoleArnIV,
        awsAssumeIamRoleArnCipherText,
        awsAssumeIamRoleArnTag,
        encryptedAccess,
        encryptedRefresh,
        encryptedAccessId,
        encryptedAwsAssumeIamRoleArn,
        ...el
      }) => ({
        ...el,
        envId,
        environment: {
          id: envId,
          name: envName,
          slug: envSlug
        },
        integrationAuth: {
          id,
          integration,
          teamId,
          url,
          namespace,
          accountId,
          refreshTag,
          refreshIV,
          refreshCiphertext,
          accessIdCiphertext,
          accessIdIV,
          accessIdTag,
          accessIV,
          accessCiphertext,
          accessTag,
          metadata,
          algorithm,
          keyEncoding,
          accessExpiresAt,
          awsAssumeIamRoleArnIV,
          awsAssumeIamRoleArnCipherText,
          awsAssumeIamRoleArnTag,
          encryptedAccess,
          encryptedRefresh,
          encryptedAccessId,
          encryptedAwsAssumeIamRoleArn
        }
      })
    );
  };

  return { ...integrationOrm, find, findOne, findById, findByProjectId, findByProjectIdV2 };
};
