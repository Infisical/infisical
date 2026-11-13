import { Knex } from "knex";

import { TableName, TKmsKekHistory } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { KekHistoryEntry } from "../models/kek-history-entry";
import { TKekHistoryStore } from "../services/dependencies";

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

export class KekHistoryStore implements TKekHistoryStore {
  constructor(private readonly knex: () => Knex) {}

  async findPage({ offset, limit }: { offset: number; limit: number }): Promise<KekHistoryEntry[]> {
    try {
      const rows = (await this.knex()(TableName.KmsKekHistory)
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
      const [{ count }] = await this.knex()(TableName.KmsKekHistory).count<{ count: string | number }[]>("* as count");
      return Number(count);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count KEK history" });
    }
  }

  async findActiveByLabel(kekLabel: string): Promise<KekHistoryEntry | null> {
    try {
      const row = (await this.knex()(TableName.KmsKekHistory).where({ kekLabel }).whereNull("retiredAt").first("*")) as
        | TKmsKekHistory
        | undefined;
      return row ? toModel(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find active KEK history by label" });
    }
  }

  async findCurrent(): Promise<KekHistoryEntry | null> {
    try {
      const row = (await this.knex()(TableName.KmsKekHistory)
        .whereNull("supersededAt")
        .orderBy("activatedAt", "desc")
        .first("*")) as TKmsKekHistory | undefined;
      return row ? toModel(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find current KEK history" });
    }
  }

  async insert(entry: KekHistoryEntry): Promise<void> {
    const record = entry.toJSON();
    try {
      await this.knex()(TableName.KmsKekHistory).insert({
        id: record.id,
        kekLabel: record.kekLabel,
        activatedAt: record.activatedAt
      } as never);
    } catch (error) {
      throw new DatabaseError({ error, name: "Insert KEK history entry" });
    }
  }

  async save(entry: KekHistoryEntry): Promise<void> {
    const record = entry.toJSON();
    try {
      await this.knex()(TableName.KmsKekHistory)
        .where({ id: record.id })
        .update({ supersededAt: record.supersededAt, retiredAt: record.retiredAt });
    } catch (error) {
      throw new DatabaseError({ error, name: "Save KEK history entry" });
    }
  }
}
