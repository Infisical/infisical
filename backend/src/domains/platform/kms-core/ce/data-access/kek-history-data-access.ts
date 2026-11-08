import { Knex } from "knex";

import { TableName, TKmsKekHistory } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { KekHistoryEntry } from "../model/kek-history-entry";

export type TKekHistoryDataAccess = {
  // Newest first. Never read unbounded: the history is never pruned.
  findPage(page: { offset: number; limit: number }): Promise<KekHistoryEntry[]>;
  count(): Promise<number>;
  findActiveByLabel(kekLabel: string): Promise<KekHistoryEntry | undefined>;
  findCurrent(): Promise<KekHistoryEntry | undefined>;
  create(entry: KekHistoryEntry): Promise<void>;
  markSuperseded(id: string, at: Date): Promise<void>;
  markRetired(id: string, at: Date): Promise<void>;
};

const toModel = (row: TKmsKekHistory) =>
  KekHistoryEntry.restore({
    id: row.id,
    kekLabel: row.kekLabel,
    activatedAt: row.activatedAt,
    supersededAt: row.supersededAt,
    retiredAt: row.retiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });

export class KekHistoryDataAccess implements TKekHistoryDataAccess {
  constructor(private readonly db: Knex) {}

  async findPage({ offset, limit }: { offset: number; limit: number }): Promise<KekHistoryEntry[]> {
    try {
      const rows = (await this.db(TableName.KmsKekHistory)
        .select("*")
        .orderBy("activatedAt", "desc")
        .offset(offset)
        .limit(limit)) as TKmsKekHistory[];
      return rows.map(toModel);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find KEK history page" });
    }
  }

  async count(): Promise<number> {
    try {
      const [{ count }] = await this.db(TableName.KmsKekHistory).count<{ count: string | number }[]>("* as count");
      return Number(count);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count KEK history" });
    }
  }

  async findActiveByLabel(kekLabel: string): Promise<KekHistoryEntry | undefined> {
    try {
      const row = (await this.db(TableName.KmsKekHistory).where({ kekLabel }).whereNull("retiredAt").first("*")) as
        | TKmsKekHistory
        | undefined;
      return row ? toModel(row) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find active KEK history by label" });
    }
  }

  async findCurrent(): Promise<KekHistoryEntry | undefined> {
    try {
      const row = (await this.db(TableName.KmsKekHistory)
        .whereNull("supersededAt")
        .orderBy("activatedAt", "desc")
        .first("*")) as TKmsKekHistory | undefined;
      return row ? toModel(row) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find current KEK history" });
    }
  }

  async create(entry: KekHistoryEntry): Promise<void> {
    const props = entry.toJSON();
    try {
      await this.db(TableName.KmsKekHistory).insert({
        id: props.id,
        kekLabel: props.kekLabel,
        activatedAt: props.activatedAt
      } as never);
    } catch (error) {
      throw new DatabaseError({ error, name: "Create KEK history entry" });
    }
  }

  async markSuperseded(id: string, at: Date): Promise<void> {
    try {
      await this.db(TableName.KmsKekHistory).where({ id }).update({ supersededAt: at });
    } catch (error) {
      throw new DatabaseError({ error, name: "Supersede KEK history entry" });
    }
  }

  async markRetired(id: string, at: Date): Promise<void> {
    try {
      await this.db(TableName.KmsKekHistory).where({ id }).update({ retiredAt: at });
    } catch (error) {
      throw new DatabaseError({ error, name: "Retire KEK history entry" });
    }
  }
}
