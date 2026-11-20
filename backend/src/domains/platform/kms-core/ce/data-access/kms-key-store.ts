import { Knex } from "knex";

import { KmsKeysSchema, ProjectType, TableName, TKmsKeys } from "@app/db/schemas";
import { toCount, TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn";

import { KmsKey } from "../models/kms-key";
import { TKmsKeyFilter, TKmsKeyPageQuery, TKmsKeyStore } from "../services/dependencies";

type TKmsKeyRow = TKmsKeys & {
  internalKmsId?: string | null;
  internalKmsEncryptedKey?: Buffer | null;
  internalKmsEncryptionAlgorithm?: string | null;
  internalKmsVersion?: number | null;
  externalKmsId?: string | null;
  externalKmsProvider?: string | null;
  externalKmsEncryptedProviderInputs?: Buffer | null;
  externalKmsStatus?: string | null;
  externalKmsStatusDetails?: string | null;
  externalKmsProviderInputsVersion?: number | null;
};

// The column default, which every row written before the column existed has.
const LEGACY_PROVIDER_INPUTS_VERSION = 1;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The schema supplies the column defaults: a historical migration reads kms_keys before keyUsage, isExportable,
// hasDeleteProtection and isPublicKeyPublished existed.
const toModel = (row: TKmsKeyRow): KmsKey => {
  const columns = KmsKeysSchema.parse(row);
  return KmsKey.restore({
    id: columns.id,
    name: columns.name,
    description: columns.description ?? null,
    orgId: columns.orgId,
    projectId: columns.projectId ?? null,
    keyUsage: columns.keyUsage,
    isDisabled: Boolean(columns.isDisabled),
    isReserved: Boolean(columns.isReserved),
    isExportable: columns.isExportable,
    hasDeleteProtection: columns.hasDeleteProtection,
    isPublicKeyPublished: columns.isPublicKeyPublished,
    kmipMetadata: columns.kmipMetadata ?? null,
    createdAt: columns.createdAt,
    updatedAt: columns.updatedAt,
    internal: row.internalKmsId
      ? {
          id: row.internalKmsId,
          encryptedKey: row.internalKmsEncryptedKey as Buffer,
          encryptionAlgorithm: row.internalKmsEncryptionAlgorithm as string,
          version: row.internalKmsVersion as number
        }
      : null,
    external: row.externalKmsId
      ? {
          id: row.externalKmsId,
          provider: row.externalKmsProvider as string,
          encryptedProviderInputs: row.externalKmsEncryptedProviderInputs as Buffer,
          status: row.externalKmsStatus ?? null,
          statusDetails: row.externalKmsStatusDetails ?? null,
          providerInputsVersion: row.externalKmsProviderInputsVersion ?? LEGACY_PROVIDER_INPUTS_VERSION
        }
      : null
  });
};

// Owns kms_keys, internal_kms and external_kms: one KmsKey is stored across them.
export class KmsKeyStore implements TKmsKeyStore {
  // Data migrations older than 20261117210000_external-kms-provider-inputs-version run KMS Core before this column
  // exists. Once seen it stays, so the schema is only probed until then.
  private static providerInputsVersionColumnSeen = false;

  constructor(private readonly connection: TStoreConnection) {}

  static resetColumnProbe(): void {
    KmsKeyStore.providerInputsVersionColumnSeen = false;
  }

  async findById(id: string, options?: TReadOptions): Promise<KmsKey | null> {
    const [key] = await this.find({ id }, options);
    return key ?? null;
  }

  find(filter: TKmsKeyFilter, options?: TReadOptions): Promise<KmsKey[]> {
    return KmsKeyStore.findWith(this.connection.reader(options), filter);
  }

  private static async findWith(knex: Knex, filter: TKmsKeyFilter): Promise<KmsKey[]> {
    // A malformed id cannot match a uuid column, and Postgres would raise instead of returning nothing.
    const single = [filter.id, filter.orgId].filter((value) => value !== undefined);
    const ids = filter.ids?.filter((id) => UUID_PATTERN.test(id));
    if (single.some((value) => !UUID_PATTERN.test(value)) || (ids && !ids.length)) return [];

    try {
      const query = KmsKeyStore.withMaterial(knex, await KmsKeyStore.hasProviderInputsVersionColumn(knex));
      if (filter.id !== undefined) void query.where(`${TableName.KmsKey}.id`, filter.id);
      if (ids) void query.whereIn(`${TableName.KmsKey}.id`, ids);
      if (filter.orgId !== undefined) void query.where(`${TableName.KmsKey}.orgId`, filter.orgId);
      if (filter.projectId === null) void query.whereNull(`${TableName.KmsKey}.projectId`);
      else if (filter.projectId !== undefined) void query.where(`${TableName.KmsKey}.projectId`, filter.projectId);
      if (filter.name !== undefined) void query.where(`${TableName.KmsKey}.name`, filter.name);
      if (filter.isReserved !== undefined) void query.where(`${TableName.KmsKey}.isReserved`, filter.isReserved);
      if (filter.keyUsage !== undefined) void query.where(`${TableName.KmsKey}.keyUsage`, filter.keyUsage);
      if (filter.isExternal === true) void query.whereNotNull(`${TableName.ExternalKms}.id`);
      if (filter.isExternal === false) void query.whereNull(`${TableName.ExternalKms}.id`);
      const rows = (await query.orderBy(`${TableName.KmsKey}.createdAt`, "asc")) as TKmsKeyRow[];
      return rows.map(toModel);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find KMS keys" });
    }
  }

  async findForUpdate(id: string): Promise<KmsKey | null> {
    await this.lockRows(id, "Find KMS key for update");
    const [key] = await KmsKeyStore.findWith(this.connection.writer(), { id });
    return key ?? null;
  }

  // Reads projects (no domain owns it yet). A project pending deletion stops publishing, like a deleted one.
  async findPublishedById(id: string, options?: TReadOptions): Promise<KmsKey | null> {
    if (!UUID_PATTERN.test(id)) return null;
    try {
      const knex = this.connection.reader(options);
      const row = (await KmsKeyStore.withMaterial(knex, await KmsKeyStore.hasProviderInputsVersionColumn(knex))
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.KmsKey}.projectId`)
        .where(`${TableName.KmsKey}.id`, id)
        .where(`${TableName.KmsKey}.isPublicKeyPublished`, true)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .first()) as TKmsKeyRow | undefined;
      return row ? toModel(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find published KMS key" });
    }
  }

  async listProjectKeys(
    { projectId, offset, limit, orderBy, orderDirection, search }: TKmsKeyPageQuery,
    options?: TReadOptions
  ): Promise<{ keys: KmsKey[]; totalCount: number }> {
    try {
      const knex = this.connection.reader(options);
      const filtered = knex(TableName.KmsKey)
        .where(`${TableName.KmsKey}.projectId`, projectId)
        .where((qb) => {
          if (search) {
            const pattern = `%${sanitizeSqlLikeString(search)}%`;
            void qb
              .whereILike(`${TableName.KmsKey}.name`, pattern)
              .orWhereRaw(`?? ::text ILIKE ?`, [`${TableName.KmsKey}.id`, pattern]);
          }
        })
        .where(`${TableName.KmsKey}.isReserved`, false)
        .join(TableName.InternalKms, `${TableName.InternalKms}.kmsKeyId`, `${TableName.KmsKey}.id`);

      const query = filtered
        .clone()
        .select(
          `${TableName.KmsKey}.*`,
          knex.raw(`count(*) OVER() as total_count`),
          knex.ref("id").withSchema(TableName.InternalKms).as("internalKmsId"),
          knex.ref("encryptedKey").withSchema(TableName.InternalKms).as("internalKmsEncryptedKey"),
          knex.ref("encryptionAlgorithm").withSchema(TableName.InternalKms).as("internalKmsEncryptionAlgorithm"),
          knex.ref("version").withSchema(TableName.InternalKms).as("internalKmsVersion")
        )
        .orderBy(`${TableName.KmsKey}.${orderBy}`, orderDirection);
      if (limit) void query.limit(limit).offset(offset);

      const rows = (await query) as (TKmsKeyRow & { total_count: string | number })[];

      // The window count rides on the page's rows, so a page past the last key has nothing to read it from.
      if (rows.length === 0 && offset > 0) {
        const [{ count }] = await filtered.count<{ count: string | number }[]>(`${TableName.KmsKey}.id as count`);
        return { keys: [], totalCount: toCount(count) };
      }

      return { keys: rows.map(toModel), totalCount: toCount(rows[0]?.total_count) };
    } catch (error) {
      throw new DatabaseError({ error, name: "List project KMS keys" });
    }
  }

  // Reads projects, which no domain owns yet.
  async countProjectKeysInOrg(orgId: string, projectType: ProjectType, options?: TReadOptions): Promise<number> {
    try {
      const result = (await this.connection
        .reader(options)(TableName.KmsKey)
        .join(TableName.Project, `${TableName.KmsKey}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Project}.type`, projectType)
        .count(`${TableName.KmsKey}.id as count`)
        .first()) as { count: string } | undefined;
      return toCount(result?.count);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count project KMS keys" });
    }
  }

  async insert(key: KmsKey): Promise<void> {
    try {
      const record = key.toJSON();
      const knex = this.connection.writer();
      await knex(TableName.KmsKey).insert({
        id: record.id,
        name: record.name,
        description: record.description,
        orgId: record.orgId,
        projectId: record.projectId,
        keyUsage: record.keyUsage,
        isDisabled: record.isDisabled,
        isReserved: record.isReserved,
        isExportable: record.isExportable,
        // Omitted when false so historical migrations can insert before these columns exist.
        ...(record.hasDeleteProtection && { hasDeleteProtection: true }),
        ...(record.isPublicKeyPublished && { isPublicKeyPublished: true }),
        kmipMetadata: record.kmipMetadata
      } as never);
      if (record.internal) {
        await knex(TableName.InternalKms).insert({
          id: record.internal.id,
          kmsKeyId: record.id,
          encryptedKey: record.internal.encryptedKey,
          encryptionAlgorithm: record.internal.encryptionAlgorithm,
          version: record.internal.version
        } as never);
      }
      if (record.external) {
        await knex(TableName.ExternalKms).insert({
          id: record.external.id,
          kmsKeyId: record.id,
          provider: record.external.provider,
          encryptedProviderInputs: record.external.encryptedProviderInputs,
          ...((await KmsKeyStore.hasProviderInputsVersionColumn(knex))
            ? { providerInputsVersion: record.external.providerInputsVersion }
            : {})
        } as never);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Insert KMS key" });
    }
  }

  async save(key: KmsKey): Promise<void> {
    try {
      const record = key.toJSON();
      const knex = this.connection.writer();
      await knex(TableName.KmsKey)
        .where({ id: record.id })
        .update({
          name: record.name,
          description: record.description,
          isDisabled: record.isDisabled,
          hasDeleteProtection: record.hasDeleteProtection,
          isExportable: record.isExportable,
          isPublicKeyPublished: record.isPublicKeyPublished,
          kmipMetadata: record.kmipMetadata as never
        });
      if (record.internal) {
        await knex(TableName.InternalKms)
          .where({ id: record.internal.id })
          .update({ encryptedKey: record.internal.encryptedKey, version: record.internal.version });
      }
      if (record.external) {
        await knex(TableName.ExternalKms)
          .where({ id: record.external.id })
          .update({
            encryptedProviderInputs: record.external.encryptedProviderInputs,
            ...((await KmsKeyStore.hasProviderInputsVersionColumn(knex))
              ? { providerInputsVersion: record.external.providerInputsVersion }
              : {})
          });
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Save KMS key" });
    }
  }

  async delete(id: string): Promise<void> {
    if (!UUID_PATTERN.test(id)) return;
    try {
      await this.connection.writer()(TableName.KmsKey).where({ id }).delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete KMS key" });
    }
  }

  async deleteMany(ids: string[]): Promise<number> {
    const valid = ids.filter((id) => UUID_PATTERN.test(id));
    if (!valid.length) return 0;
    try {
      return await this.connection.writer()(TableName.KmsKey).whereIn("id", valid).delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete KMS keys" });
    }
  }

  // Locks both rows, kms_keys first. save writes attributes and material together, so locking only one could write
  // back what another writer changed.
  private async lockRows(id: string, name: string): Promise<void> {
    if (!UUID_PATTERN.test(id)) return;
    try {
      const knex = this.connection.writer();
      await knex(TableName.KmsKey).where({ id }).forUpdate().first("id");
      await knex(TableName.InternalKms).where({ kmsKeyId: id }).forUpdate().first("id");
    } catch (error) {
      throw new DatabaseError({ error, name });
    }
  }

  private static async hasProviderInputsVersionColumn(knex: Knex): Promise<boolean> {
    if (KmsKeyStore.providerInputsVersionColumnSeen) return true;
    const exists = await knex.schema.hasColumn(TableName.ExternalKms, "providerInputsVersion");
    if (exists) KmsKeyStore.providerInputsVersionColumnSeen = true;
    return exists;
  }

  private static withMaterial(knex: Knex, hasProviderInputsVersion: boolean) {
    const query = knex(TableName.KmsKey)
      .leftJoin(TableName.InternalKms, `${TableName.KmsKey}.id`, `${TableName.InternalKms}.kmsKeyId`)
      .leftJoin(TableName.ExternalKms, `${TableName.KmsKey}.id`, `${TableName.ExternalKms}.kmsKeyId`)
      .select(`${TableName.KmsKey}.*`)
      .select(
        knex.ref("id").withSchema(TableName.InternalKms).as("internalKmsId"),
        knex.ref("encryptedKey").withSchema(TableName.InternalKms).as("internalKmsEncryptedKey"),
        knex.ref("encryptionAlgorithm").withSchema(TableName.InternalKms).as("internalKmsEncryptionAlgorithm"),
        knex.ref("version").withSchema(TableName.InternalKms).as("internalKmsVersion"),
        knex.ref("id").withSchema(TableName.ExternalKms).as("externalKmsId"),
        knex.ref("provider").withSchema(TableName.ExternalKms).as("externalKmsProvider"),
        knex.ref("encryptedProviderInputs").withSchema(TableName.ExternalKms).as("externalKmsEncryptedProviderInputs"),
        knex.ref("status").withSchema(TableName.ExternalKms).as("externalKmsStatus"),
        knex.ref("statusDetails").withSchema(TableName.ExternalKms).as("externalKmsStatusDetails")
      );
    if (hasProviderInputsVersion) {
      void query.select(
        knex.ref("providerInputsVersion").withSchema(TableName.ExternalKms).as("externalKmsProviderInputsVersion")
      );
    }
    return query;
  }
}
