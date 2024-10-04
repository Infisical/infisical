import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { KmsKeysSchema, TableName, TInternalKms, TKmsKeys } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";
import { CmekOrderBy, TListCmeksByProjectIdDTO } from "@app/services/cmek/cmek-types";

export type TKmsKeyDALFactory = ReturnType<typeof kmskeyDALFactory>;

export const kmskeyDALFactory = (db: TDbClient) => {
  const kmsOrm = ormify(db, TableName.KmsKey);

  // akhilmhdh: this function should never be called outside kms service
  // why: because the encrypted key should never be shared with another service
  const findByIdWithAssociatedKms = async (id: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.KmsKey)
        .where({ [`${TableName.KmsKey}.id` as "id"]: id })
        .join(TableName.Organization, `${TableName.KmsKey}.orgId`, `${TableName.Organization}.id`)
        .leftJoin(TableName.InternalKms, `${TableName.KmsKey}.id`, `${TableName.InternalKms}.kmsKeyId`)
        .leftJoin(TableName.ExternalKms, `${TableName.KmsKey}.id`, `${TableName.ExternalKms}.kmsKeyId`)
        .first()
        .select(selectAllTableCols(TableName.KmsKey))
        .select(
          db.ref("id").withSchema(TableName.InternalKms).as("internalKmsId"),
          db.ref("encryptedKey").withSchema(TableName.InternalKms).as("internalKmsEncryptedKey"),
          db.ref("encryptionAlgorithm").withSchema(TableName.InternalKms).as("internalKmsEncryptionAlgorithm"),
          db.ref("version").withSchema(TableName.InternalKms).as("internalKmsVersion"),
          db.ref("id").withSchema(TableName.InternalKms).as("internalKmsId")
        )
        .select(
          db.ref("id").withSchema(TableName.ExternalKms).as("externalKmsId"),
          db.ref("provider").withSchema(TableName.ExternalKms).as("externalKmsProvider"),
          db.ref("encryptedProviderInputs").withSchema(TableName.ExternalKms).as("externalKmsEncryptedProviderInput"),
          db.ref("status").withSchema(TableName.ExternalKms).as("externalKmsStatus"),
          db.ref("statusDetails").withSchema(TableName.ExternalKms).as("externalKmsStatusDetails")
        )
        .select(
          db.ref("kmsDefaultKeyId").withSchema(TableName.Organization).as("orgKmsDefaultKeyId"),
          db.ref("kmsEncryptedDataKey").withSchema(TableName.Organization).as("orgKmsEncryptedDataKey")
        );

      const data = {
        ...KmsKeysSchema.parse(result),
        isExternal: Boolean(result?.externalKmsId),
        orgKms: {
          id: result?.orgKmsDefaultKeyId,
          encryptedDataKey: result?.orgKmsEncryptedDataKey
        },
        externalKms: result?.externalKmsId
          ? {
              id: result.externalKmsId,
              provider: result.externalKmsProvider,
              encryptedProviderInput: result.externalKmsEncryptedProviderInput,
              status: result.externalKmsStatus,
              statusDetails: result.externalKmsStatusDetails
            }
          : undefined,
        internalKms: result?.internalKmsId
          ? {
              id: result.internalKmsId,
              encryptedKey: result.internalKmsEncryptedKey,
              encryptionAlgorithm: result.internalKmsEncryptionAlgorithm,
              version: result.internalKmsVersion
            }
          : undefined
      };
      return data;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  };

  const findKmsKeysByProjectId = async (
    {
      projectId,
      offset = 0,
      limit,
      orderBy = CmekOrderBy.Name,
      orderDirection = OrderByDirection.ASC,
      search
    }: TListCmeksByProjectIdDTO,
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.KmsKey)
        .where("projectId", projectId)
        .where((qb) => {
          if (search) {
            void qb.whereILike("name", `%${search}%`);
          }
        })
        .join(TableName.InternalKms, `${TableName.InternalKms}.kmsKeyId`, `${TableName.KmsKey}.id`)
        .select<
          (TKmsKeys &
            Pick<TInternalKms, "version" | "encryptionAlgorithm"> & {
              total_count: number;
            })[]
        >(
          selectAllTableCols(TableName.KmsKey),
          db.raw(`count(*) OVER() as total_count`),
          db.ref("encryptionAlgorithm").withSchema(TableName.InternalKms),
          db.ref("version").withSchema(TableName.InternalKms)
        )
        .orderBy(orderBy, orderDirection);

      if (limit) {
        void query.limit(limit).offset(offset);
      }

      const data = await query;

      return { keys: data, totalCount: Number(data?.[0]?.total_count ?? 0) };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find kms keys by project id" });
    }
  };

  return { ...kmsOrm, findByIdWithAssociatedKms, findKmsKeysByProjectId };
};
