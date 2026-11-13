import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { GrandfatheredOrg } from "../models/grandfathered-org";
import { TGrandfatheredOrgStore } from "../services/dependencies";

export class GrandfatheredOrgStore implements TGrandfatheredOrgStore {
  constructor(private readonly knex: () => Knex) {}

  async findByOrgId(rootOrgId: string): Promise<GrandfatheredOrg | null> {
    try {
      const row = await this.knex()(TableName.AgentVaultGrandfatheredOrg).where({ orgId: rootOrgId }).first();
      return row ? GrandfatheredOrg.restore({ orgId: row.orgId, endedAt: row.endedAt ?? null }) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find Agent Vault grandfathered org" });
    }
  }

  async saveEnded(grandfatheredOrg: GrandfatheredOrg): Promise<void> {
    const { orgId, endedAt } = grandfatheredOrg.toJSON();
    if (!endedAt) return;
    try {
      await this.knex()(TableName.AgentVaultGrandfatheredOrg).where({ orgId }).whereNull("endedAt").update({ endedAt });
    } catch (error) {
      throw new DatabaseError({ error, name: "End Agent Vault grandfathering" });
    }
  }
}
