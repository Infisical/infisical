import { TableName } from "@app/db/schemas";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

import { IdentityAttribute } from "../model/identity-attribute";

export type TAttributeOwner = { userId: string; orgId: string } | { identityId: string; orgId: string };

export type TIdentityAttributeDataAccess = {
  // Replaces every attribute the owner has in the org with these.
  replace(owner: TAttributeOwner, attributes: { key: string; value: string }[]): Promise<IdentityAttribute[]>;
};

// Owns identity_metadata.
export class IdentityAttributeDataAccess implements TIdentityAttributeDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  async replace(owner: TAttributeOwner, attributes: { key: string; value: string }[]): Promise<IdentityAttribute[]> {
    try {
      const knex = this.db.writer();
      const ownerColumns =
        "userId" in owner
          ? { userId: owner.userId, orgId: owner.orgId }
          : { identityId: owner.identityId, orgId: owner.orgId };
      await knex(TableName.IdentityMetadata).where(ownerColumns).del();
      if (!attributes.length) return [];
      const rows = await knex(TableName.IdentityMetadata)
        .insert(attributes.map((attribute) => ({ ...ownerColumns, ...attribute })))
        .returning(["id", "key", "value"]);
      return rows.map((row) => IdentityAttribute.restore(row));
    } catch (error) {
      throw new DatabaseError({ error, name: "Replace identity attributes" });
    }
  }
}
