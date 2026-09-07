import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { InternalKmsSchema, KmsKeysSchema, TableName, TInternalKms, TKmsKeys } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, prependTableNameToFindFilter, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";
import {
  CmekKeyVersionsOrderBy,
  CmekOrderBy,
  TListCmekKeyVersionsDTO,
  TListCmeksByProjectIdDTO
} from "@app/services/cmek/cmek-types";

export type TKmsKeyDALFactory = ReturnType<typeof kmskeyDALFactory>;

type TCmekFindFilter = Parameters<typeof buildFindFilter<TKmsKeys>>[0];

type TAssociatedKmsQueryResult = TKmsKeys & {
  internalKmsId: string | null;
  internalKmsEncryptedKey: Buffer | null;
  internalKmsEncryptionAlgorithm: string | null;
  internalKmsVersion: number;
  externalKmsId: string | null;
  externalKmsProvider: string | null;
  externalKmsEncryptedProviderInput: Buffer | null;
  externalKmsStatus: string | null;
  externalKmsStatusDetails: string | null;
  orgKmsDefaultKeyId: string | null;
  orgKmsEncryptedDataKey: Buffer | null;
  importEncryptionAlgorithm: string | null;
};

type TProjectCmekQueryResult = TKmsKeys & {
  internalKmsEncryptionAlgorithm: string | null;
  importEncryptionAlgorithm: string | null;
  internalKmsVersion: number;
};

const baseCmekQuery = ({ filter, db, tx }: { db: TDbClient; filter?: TCmekFindFilter; tx?: Knex }) => {
  const query = (tx || db.replicaNode())(TableName.KmsKey)
    .where(`${TableName.KmsKey}.isReserved`, false)
    .leftJoin(TableName.InternalKms, `${TableName.InternalKms}.kmsKeyId`, `${TableName.KmsKey}.id`)
    .leftJoin(TableName.KmsKeyImportMeta, `${TableName.KmsKeyImportMeta}.keyId`, `${TableName.KmsKey}.id`)
    .select<(TKmsKeys & Pick<TInternalKms, "encryptionAlgorithm" | "version">)[]>(
      selectAllTableCols(TableName.KmsKey),
      db.raw("COALESCE(??, ??) AS ??", [
        `${TableName.InternalKms}.encryptionAlgorithm`,
        `${TableName.KmsKeyImportMeta}.encryptionAlgorithm`,
        "encryptionAlgorithm"
      ]),
      // Import-only keys have no active internal_kms row until their first key material import.
      // Expose that pending state as version 0 so response schemas retain their numeric version contract.
      db.raw("COALESCE(??, 0)::int AS ??", [`${TableName.InternalKms}.version`, "version"])
    );

  if (filter) {
    /* eslint-disable @typescript-eslint/no-misused-promises */
    void query.where(buildFindFilter(prependTableNameToFindFilter(TableName.KmsKey, filter)));
  }

  return query;
};

export const kmskeyDALFactory = (db: TDbClient) => {
  const kmsOrm = ormify(db, TableName.KmsKey);

  const findByIdForUpdate = async (id: string, tx: Knex) => {
    try {
      const doc = await tx(TableName.KmsKey).where({ id }).forUpdate().first();
      return doc ? KmsKeysSchema.parse(doc) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find KMS key for update" });
    }
  };

  // akhilmhdh: this function should never be called outside kms service
  // why: because the encrypted key should never be shared with another service
  const findByIdWithAssociatedKms = async (id: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())<TAssociatedKmsQueryResult>(TableName.KmsKey)
        .where({ [`${TableName.KmsKey}.id` as "id"]: id })
        .join(TableName.Organization, `${TableName.KmsKey}.orgId`, `${TableName.Organization}.id`)
        .leftJoin(TableName.InternalKms, `${TableName.KmsKey}.id`, `${TableName.InternalKms}.kmsKeyId`)
        .leftJoin(TableName.ExternalKms, `${TableName.KmsKey}.id`, `${TableName.ExternalKms}.kmsKeyId`)
        .leftJoin(TableName.KmsKeyImportMeta, `${TableName.KmsKey}.id`, `${TableName.KmsKeyImportMeta}.keyId`)
        .select(selectAllTableCols(TableName.KmsKey))
        .select(
          db.ref("id").withSchema(TableName.InternalKms).as("internalKmsId"),
          db.ref("encryptedKey").withSchema(TableName.InternalKms).as("internalKmsEncryptedKey"),
          db.ref("encryptionAlgorithm").withSchema(TableName.InternalKms).as("internalKmsEncryptionAlgorithm"),
          db.raw("COALESCE(??, 0)::int AS ??", [`${TableName.InternalKms}.version`, "internalKmsVersion"])
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
        )
        .select<TAssociatedKmsQueryResult[]>(
          db.ref("encryptionAlgorithm").withSchema(TableName.KmsKeyImportMeta).as("importEncryptionAlgorithm")
        )
        .first();

      if (!result) return undefined;

      const data = {
        ...KmsKeysSchema.parse(result),
        importEncryptionAlgorithm: result.importEncryptionAlgorithm,
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
        internalKms: result.internalKmsId
          ? InternalKmsSchema.parse({
              id: result.internalKmsId,
              encryptedKey: result.internalKmsEncryptedKey,
              encryptionAlgorithm: result.internalKmsEncryptionAlgorithm,
              version: result.internalKmsVersion,
              kmsKeyId: result.id
            })
          : undefined
      };
      return data;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  };

  const findByIdsWithAssociatedKms = async (ids: string[], tx?: Knex) => {
    try {
      const results = await (tx || db.replicaNode())<TAssociatedKmsQueryResult>(TableName.KmsKey)
        .whereIn(`${TableName.KmsKey}.id`, ids)
        .join(TableName.Organization, `${TableName.KmsKey}.orgId`, `${TableName.Organization}.id`)
        .leftJoin(TableName.InternalKms, `${TableName.KmsKey}.id`, `${TableName.InternalKms}.kmsKeyId`)
        .leftJoin(TableName.ExternalKms, `${TableName.KmsKey}.id`, `${TableName.ExternalKms}.kmsKeyId`)
        .leftJoin(TableName.KmsKeyImportMeta, `${TableName.KmsKey}.id`, `${TableName.KmsKeyImportMeta}.keyId`)
        .select(selectAllTableCols(TableName.KmsKey))
        .select(
          db.ref("id").withSchema(TableName.InternalKms).as("internalKmsId"),
          db.ref("encryptedKey").withSchema(TableName.InternalKms).as("internalKmsEncryptedKey"),
          db.ref("encryptionAlgorithm").withSchema(TableName.InternalKms).as("internalKmsEncryptionAlgorithm"),
          db.raw("COALESCE(??, 0)::int AS ??", [`${TableName.InternalKms}.version`, "internalKmsVersion"])
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
        )
        .select<TAssociatedKmsQueryResult[]>(
          db.ref("encryptionAlgorithm").withSchema(TableName.KmsKeyImportMeta).as("importEncryptionAlgorithm")
        );

      return results.map((result) => ({
        ...KmsKeysSchema.parse(result),
        importEncryptionAlgorithm: result.importEncryptionAlgorithm,
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
        internalKms: result.internalKmsId
          ? InternalKmsSchema.parse({
              id: result.internalKmsId,
              encryptedKey: result.internalKmsEncryptedKey,
              encryptionAlgorithm: result.internalKmsEncryptionAlgorithm,
              version: result.internalKmsVersion,
              kmsKeyId: result.id
            })
          : undefined
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by ids with associated kms" });
    }
  };

  const findProjectCmeks = async (projectId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())<TProjectCmekQueryResult>(TableName.KmsKey)
        .where({
          [`${TableName.KmsKey}.projectId` as "projectId"]: projectId,
          [`${TableName.KmsKey}.isReserved` as "isReserved"]: false
        })
        .join(TableName.Organization, `${TableName.KmsKey}.orgId`, `${TableName.Organization}.id`)
        .leftJoin(TableName.InternalKms, `${TableName.KmsKey}.id`, `${TableName.InternalKms}.kmsKeyId`)
        .leftJoin(TableName.KmsKeyImportMeta, `${TableName.KmsKey}.id`, `${TableName.KmsKeyImportMeta}.keyId`)
        .select(selectAllTableCols(TableName.KmsKey))
        .select<TProjectCmekQueryResult[]>(
          db.ref("encryptionAlgorithm").withSchema(TableName.InternalKms).as("internalKmsEncryptionAlgorithm"),
          db.ref("encryptionAlgorithm").withSchema(TableName.KmsKeyImportMeta).as("importEncryptionAlgorithm"),
          db.raw("COALESCE(??, 0)::int AS ??", [`${TableName.InternalKms}.version`, "internalKmsVersion"])
        );

      return result.map((entry) => {
        const algorithm = entry.isImportable ? entry.importEncryptionAlgorithm : entry.internalKmsEncryptionAlgorithm;
        if (!algorithm) {
          throw new DatabaseError({
            error: new Error(`KMS key '${entry.id}' has no encryption algorithm`),
            message: `KMS key '${entry.id}' has no encryption algorithm`
          });
        }

        return {
          ...KmsKeysSchema.parse(entry),
          isActive: !entry.isDisabled,
          algorithm,
          version: entry.internalKmsVersion,
          kmipMetadata: entry.kmipMetadata as Record<string, unknown>
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project cmeks" });
    }
  };

  const listKeyVersions = async (
    {
      keyId,
      offset = 0,
      limit = 100,
      orderBy = CmekKeyVersionsOrderBy.Version,
      orderDirection = OrderByDirection.ASC
    }: TListCmekKeyVersionsDTO,
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.InternalKmsKeyVersion)
        .join(TableName.InternalKms, `${TableName.InternalKms}.id`, `${TableName.InternalKmsKeyVersion}.internalKmsId`)
        .where(`${TableName.InternalKms}.kmsKeyId`, keyId)
        .select<
          {
            id: string;
            version: number;
            origin: "internal" | "imported";
            createdAt: Date;
            total_count: number;
          }[]
        >(
          db.ref("id").withSchema(TableName.InternalKmsKeyVersion),
          db.ref("version").withSchema(TableName.InternalKmsKeyVersion),
          db.ref("origin").withSchema(TableName.InternalKmsKeyVersion),
          db.ref("createdAt").withSchema(TableName.InternalKmsKeyVersion),
          db.raw("count(*) OVER() AS total_count")
        )
        .orderBy(`${TableName.InternalKmsKeyVersion}.${orderBy}`, orderDirection)
        .orderBy(`${TableName.InternalKmsKeyVersion}.id`, OrderByDirection.ASC)
        .limit(limit)
        .offset(offset);

      const versions = await query;

      return {
        versions: versions.map(({ total_count: _totalCount, ...version }) => version),
        totalCount: Number(versions[0]?.total_count ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "List KMS key versions" });
    }
  };

  const listCmeksByProjectId = async (
    {
      projectId,
      offset = 0,
      limit = 100,
      orderBy = CmekOrderBy.Name,
      orderDirection = OrderByDirection.ASC,
      search
    }: TListCmeksByProjectIdDTO,
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.KmsKey)
        .where(`${TableName.KmsKey}.projectId`, projectId)
        .where((qb) => {
          if (search) {
            const pattern = `%${search}%`;
            void qb
              .whereILike(`${TableName.KmsKey}.name`, pattern)
              .orWhereRaw(`?? ::text ILIKE ?`, [`${TableName.KmsKey}.id`, pattern]);
          }
        })
        .where(`${TableName.KmsKey}.isReserved`, false)
        .leftJoin(TableName.InternalKms, `${TableName.InternalKms}.kmsKeyId`, `${TableName.KmsKey}.id`)
        .leftJoin(TableName.KmsKeyImportMeta, `${TableName.KmsKeyImportMeta}.keyId`, `${TableName.KmsKey}.id`)
        .select<
          (TKmsKeys &
            Pick<TInternalKms, "version" | "encryptionAlgorithm"> & {
              total_count: number;
              totalVersions: number;
            })[]
        >(
          selectAllTableCols(TableName.KmsKey),
          db.raw(`count(*) OVER() as total_count`),
          db.raw("COALESCE(??, ??) AS ??", [
            `${TableName.InternalKms}.encryptionAlgorithm`,
            `${TableName.KmsKeyImportMeta}.encryptionAlgorithm`,
            "encryptionAlgorithm"
          ]),
          // Import-only keys have no active internal_kms row until their first key material import.
          // Expose that pending state as version 0 so the KMS list API retains its numeric version contract.
          db.raw("COALESCE(??, 0)::int AS ??", [`${TableName.InternalKms}.version`, "version"]),
          db.raw("COALESCE((SELECT MAX(??) FROM ?? WHERE ??.?? = ??.??), 0)::int AS ??", [
            "version",
            TableName.InternalKmsKeyVersion,
            TableName.InternalKmsKeyVersion,
            "internalKmsId",
            TableName.InternalKms,
            "id",
            "totalVersions"
          ])
        )
        .orderBy(`${TableName.KmsKey}.${orderBy}`, orderDirection)
        // Keep pagination stable when multiple keys share the same name.
        .orderBy(`${TableName.KmsKey}.id`, OrderByDirection.ASC)
        .limit(limit)
        .offset(offset);

      const data = await query;

      return { keys: data, totalCount: Number(data?.[0]?.total_count ?? 0) };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find kms keys by project id" });
    }
  };

  const findCmekById = async (id: string, tx?: Knex) => {
    try {
      const key = await baseCmekQuery({
        filter: { id },
        db,
        tx
      }).first();

      return key;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by ID - KMS Key" });
    }
  };

  const findCmeksByIds = async (ids: string[], tx?: Knex) => {
    try {
      return await baseCmekQuery({ db, tx }).whereIn(`${TableName.KmsKey}.id`, ids);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find cmeks by IDs" });
    }
  };

  const findCmekByName = async (keyName: string, projectId: string, tx?: Knex) => {
    try {
      const key = await baseCmekQuery({
        filter: { name: keyName, projectId },
        db,
        tx
      }).first();

      return key;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by Name - KMS Key" });
    }
  };

  return {
    ...kmsOrm,
    findByIdForUpdate,
    findByIdWithAssociatedKms,
    findByIdsWithAssociatedKms,
    listKeyVersions,
    listCmeksByProjectId,
    findCmekById,
    findCmeksByIds,
    findCmekByName,
    findProjectCmeks
  };
};
