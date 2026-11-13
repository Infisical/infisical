import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { OrganizationKey } from "../models/organization-key";
import { TOrganizationKeyStore } from "../services/dependencies";

// The key columns on organizations, which no domain owns yet; KMS Core writes only these columns.
export class OrganizationKeyStore implements TOrganizationKeyStore {
  constructor(private readonly knex: () => Knex) {}

  async find(orgId: string): Promise<OrganizationKey | null> {
    try {
      const row = await this.knex()(TableName.Organization)
        .where({ id: orgId })
        .first("id", "kmsDefaultKeyId", "kmsEncryptedDataKey");
      if (!row) return null;
      return OrganizationKey.restore({
        orgId: row.id,
        kmsKeyId: row.kmsDefaultKeyId ?? null,
        encryptedDataKey: row.kmsEncryptedDataKey ?? null
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org keys" });
    }
  }

  claimKmsKey(key: OrganizationKey): Promise<boolean> {
    const { orgId, kmsKeyId } = key.toJSON();
    return this.claim(orgId, "kmsDefaultKeyId", kmsKeyId);
  }

  claimDataKey(key: OrganizationKey): Promise<boolean> {
    const { orgId, encryptedDataKey } = key.toJSON();
    return this.claim(orgId, "kmsEncryptedDataKey", encryptedDataKey);
  }

  async referencesKey(kmsKeyId: string): Promise<boolean> {
    try {
      const org = await this.knex()(TableName.Organization).where({ kmsDefaultKeyId: kmsKeyId }).first("id");
      return Boolean(org);
    } catch (error) {
      throw new DatabaseError({ error, name: "Check org KMS key references" });
    }
  }

  private async claim(
    orgId: string,
    column: "kmsDefaultKeyId" | "kmsEncryptedDataKey",
    value: string | Buffer | null
  ): Promise<boolean> {
    try {
      if (value === null) throw new Error(`The organization key has no ${column} to claim`);
      const updated = await this.knex()(TableName.Organization)
        .where({ id: orgId })
        .whereNull(column)
        .update({ [column]: value } as never);
      return updated > 0;
    } catch (error) {
      throw new DatabaseError({ error, name: `Claim ${column}` });
    }
  }
}
