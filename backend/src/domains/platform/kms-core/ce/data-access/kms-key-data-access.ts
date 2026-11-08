import { Knex } from "knex";

import { ProjectType, TableName, TKmsKeys } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { OrderByDirection } from "@app/lib/types";

import { KmsKey, TKmsKeyProps } from "../model/kms-key";

export type TKmsKeyFilter = {
  id?: string;
  ids?: string[];
  orgId?: string;
  // null matches org-level keys only.
  projectId?: string | null;
  name?: string;
  isReserved?: boolean;
  keyUsage?: string;
};

export type TKmsKeyPageQuery = {
  projectId: string;
  offset: number;
  limit?: number;
  orderBy: "name";
  orderDirection: OrderByDirection;
  search?: string;
};

export type TKmsKeyDataAccess = {
  create(key: KmsKey): Promise<KmsKey>;
  findById(id: string): Promise<KmsKey | undefined>;
  find(filter: TKmsKeyFilter): Promise<KmsKey[]>;
  // Takes the internal_kms row lock a rotation holds, then reads the key.
  findByIdForRotation(id: string): Promise<KmsKey | undefined>;
  // Customer keys of a project (not reserved, with internal material), one page and the total.
  listProjectKeys(query: TKmsKeyPageQuery): Promise<{ keys: KmsKey[]; totalCount: number }>;
  saveMaterial(key: KmsKey): Promise<void>;
  saveAttributes(key: KmsKey): Promise<void>;
  saveExternalConfig(key: KmsKey): Promise<void>;
  // Its material, versions and external config go with it (foreign keys cascade inside this domain).
  deleteById(id: string): Promise<KmsKey | undefined>;
  // Null when the key has delete protection; undefined when it does not exist.
  deleteIfUnprotected(id: string): Promise<KmsKey | null | undefined>;
  deleteByIds(ids: string[]): Promise<number>;
  countProjectKeysInOrg(orgId: string, projectType: ProjectType): Promise<number>;
};

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
};

const toModel = (row: TKmsKeyRow): KmsKey => {
  const props: TKmsKeyProps = {
    id: row.id,
    name: row.name,
    description: row.description,
    orgId: row.orgId,
    projectId: row.projectId,
    keyUsage: row.keyUsage,
    isDisabled: row.isDisabled,
    isReserved: row.isReserved,
    isExportable: row.isExportable,
    hasDeleteProtection: row.hasDeleteProtection,
    kmipMetadata: row.kmipMetadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    internal: row.internalKmsId
      ? {
          id: row.internalKmsId,
          encryptedKey: row.internalKmsEncryptedKey as Buffer,
          encryptionAlgorithm: row.internalKmsEncryptionAlgorithm as string,
          version: row.internalKmsVersion as number
        }
      : undefined,
    external: row.externalKmsId
      ? {
          id: row.externalKmsId,
          provider: row.externalKmsProvider as string,
          encryptedProviderInputs: row.externalKmsEncryptedProviderInputs as Buffer,
          status: row.externalKmsStatus,
          statusDetails: row.externalKmsStatusDetails
        }
      : undefined
  };
  return KmsKey.restore(props);
};

// Owns kms_keys, internal_kms and external_kms: one KmsKey is stored across them.
export class KmsKeyDataAccess implements TKmsKeyDataAccess {
  constructor(private readonly db: Knex) {}

  async create(key: KmsKey): Promise<KmsKey> {
    try {
      const props = key.toJSON();
      await this.db(TableName.KmsKey).insert({
        id: props.id,
        name: props.name,
        description: props.description,
        orgId: props.orgId,
        projectId: props.projectId,
        keyUsage: props.keyUsage,
        isDisabled: props.isDisabled ?? false,
        isReserved: props.isReserved ?? true,
        isExportable: props.isExportable,
        hasDeleteProtection: props.hasDeleteProtection,
        kmipMetadata: props.kmipMetadata as never
      } as never);
      if (props.internal) {
        await this.db(TableName.InternalKms).insert({
          id: props.internal.id,
          kmsKeyId: props.id,
          encryptedKey: props.internal.encryptedKey,
          encryptionAlgorithm: props.internal.encryptionAlgorithm,
          version: props.internal.version
        } as never);
      }
      if (props.external) {
        await this.db(TableName.ExternalKms).insert({
          id: props.external.id,
          kmsKeyId: props.id,
          provider: props.external.provider,
          encryptedProviderInputs: props.external.encryptedProviderInputs
        } as never);
      }
      return (await this.findById(props.id)) as KmsKey;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create KMS key" });
    }
  }

  async findById(id: string): Promise<KmsKey | undefined> {
    const [key] = await this.find({ id });
    return key;
  }

  async find(filter: TKmsKeyFilter): Promise<KmsKey[]> {
    try {
      const query = this.withMaterial();
      if (filter.id) void query.where(`${TableName.KmsKey}.id`, filter.id);
      if (filter.ids) void query.whereIn(`${TableName.KmsKey}.id`, filter.ids);
      if (filter.orgId) void query.where(`${TableName.KmsKey}.orgId`, filter.orgId);
      if (filter.projectId === null) void query.whereNull(`${TableName.KmsKey}.projectId`);
      else if (filter.projectId) void query.where(`${TableName.KmsKey}.projectId`, filter.projectId);
      if (filter.name) void query.where(`${TableName.KmsKey}.name`, filter.name);
      if (filter.isReserved !== undefined) void query.where(`${TableName.KmsKey}.isReserved`, filter.isReserved);
      if (filter.keyUsage) void query.where(`${TableName.KmsKey}.keyUsage`, filter.keyUsage);
      const rows = (await query.orderBy(`${TableName.KmsKey}.createdAt`, "asc")) as TKmsKeyRow[];
      return rows.map(toModel);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find KMS keys" });
    }
  }

  async findByIdForRotation(id: string): Promise<KmsKey | undefined> {
    try {
      await this.db(TableName.InternalKms).where({ kmsKeyId: id }).forUpdate().first();
      return await this.findById(id);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find KMS key for rotation" });
    }
  }

  async listProjectKeys({
    projectId,
    offset,
    limit,
    orderBy,
    orderDirection,
    search
  }: TKmsKeyPageQuery): Promise<{ keys: KmsKey[]; totalCount: number }> {
    try {
      const filtered = this.db(TableName.KmsKey)
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
          this.db.raw(`count(*) OVER() as total_count`),
          this.db.ref("id").withSchema(TableName.InternalKms).as("internalKmsId"),
          this.db.ref("encryptedKey").withSchema(TableName.InternalKms).as("internalKmsEncryptedKey"),
          this.db.ref("encryptionAlgorithm").withSchema(TableName.InternalKms).as("internalKmsEncryptionAlgorithm"),
          this.db.ref("version").withSchema(TableName.InternalKms).as("internalKmsVersion")
        )
        .orderBy(`${TableName.KmsKey}.${orderBy}`, orderDirection);
      if (limit) void query.limit(limit).offset(offset);

      const rows = (await query) as (TKmsKeyRow & { total_count: string | number })[];

      // The window count rides on the page's rows, so a page past the last key has nothing to read it from.
      if (rows.length === 0 && offset > 0) {
        const [{ count }] = await filtered.count<{ count: string | number }[]>(`${TableName.KmsKey}.id as count`);
        return { keys: [], totalCount: Number(count) };
      }

      return { keys: rows.map(toModel), totalCount: Number(rows[0]?.total_count ?? 0) };
    } catch (error) {
      throw new DatabaseError({ error, name: "List project KMS keys" });
    }
  }

  async saveMaterial(key: KmsKey): Promise<void> {
    const { internal } = key;
    if (!internal) return;
    try {
      await this.db(TableName.InternalKms)
        .where({ id: internal.id })
        .update({ encryptedKey: internal.encryptedKey, version: internal.version });
    } catch (error) {
      throw new DatabaseError({ error, name: "Save KMS key material" });
    }
  }

  async saveAttributes(key: KmsKey): Promise<void> {
    const props = key.toJSON();
    try {
      await this.db(TableName.KmsKey)
        .where({ id: props.id })
        .update({
          name: props.name,
          description: props.description,
          isDisabled: props.isDisabled ?? false,
          hasDeleteProtection: props.hasDeleteProtection,
          isExportable: props.isExportable,
          kmipMetadata: props.kmipMetadata as never
        });
    } catch (error) {
      throw new DatabaseError({ error, name: "Save KMS key attributes" });
    }
  }

  async saveExternalConfig(key: KmsKey): Promise<void> {
    const { external } = key;
    if (!external) return;
    try {
      await this.db(TableName.ExternalKms)
        .where({ id: external.id })
        .update({ encryptedProviderInputs: external.encryptedProviderInputs });
    } catch (error) {
      throw new DatabaseError({ error, name: "Save external KMS config" });
    }
  }

  async deleteById(id: string): Promise<KmsKey | undefined> {
    const key = await this.findById(id);
    if (!key) return undefined;
    try {
      await this.db(TableName.KmsKey).where({ id }).delete();
      return key;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete KMS key" });
    }
  }

  async deleteIfUnprotected(id: string): Promise<KmsKey | null | undefined> {
    const key = await this.findById(id);
    if (!key) return undefined;
    try {
      const deleted = await this.db(TableName.KmsKey).where({ id, hasDeleteProtection: false }).delete();
      return deleted ? key : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete KMS key" });
    }
  }

  async deleteByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    try {
      return await this.db(TableName.KmsKey).whereIn("id", ids).delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete KMS keys" });
    }
  }

  // Reads projects, which no domain owns yet, to count a product's keys for org stats.
  async countProjectKeysInOrg(orgId: string, projectType: ProjectType): Promise<number> {
    try {
      const result = (await this.db(TableName.KmsKey)
        .join(TableName.Project, `${TableName.KmsKey}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Project}.type`, projectType)
        .count(`${TableName.KmsKey}.id as count`)
        .first()) as { count: string } | undefined;
      return parseInt(result?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count project KMS keys" });
    }
  }

  private withMaterial() {
    return this.db(TableName.KmsKey)
      .leftJoin(TableName.InternalKms, `${TableName.KmsKey}.id`, `${TableName.InternalKms}.kmsKeyId`)
      .leftJoin(TableName.ExternalKms, `${TableName.KmsKey}.id`, `${TableName.ExternalKms}.kmsKeyId`)
      .select(`${TableName.KmsKey}.*`)
      .select(
        this.db.ref("id").withSchema(TableName.InternalKms).as("internalKmsId"),
        this.db.ref("encryptedKey").withSchema(TableName.InternalKms).as("internalKmsEncryptedKey"),
        this.db.ref("encryptionAlgorithm").withSchema(TableName.InternalKms).as("internalKmsEncryptionAlgorithm"),
        this.db.ref("version").withSchema(TableName.InternalKms).as("internalKmsVersion"),
        this.db.ref("id").withSchema(TableName.ExternalKms).as("externalKmsId"),
        this.db.ref("provider").withSchema(TableName.ExternalKms).as("externalKmsProvider"),
        this.db
          .ref("encryptedProviderInputs")
          .withSchema(TableName.ExternalKms)
          .as("externalKmsEncryptedProviderInputs"),
        this.db.ref("status").withSchema(TableName.ExternalKms).as("externalKmsStatus"),
        this.db.ref("statusDetails").withSchema(TableName.ExternalKms).as("externalKmsStatusDetails")
      );
  }
}
