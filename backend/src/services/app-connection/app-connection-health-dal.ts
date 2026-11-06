import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAppConnectionHealth, TAppConnectionHealthInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAppConnectionHealthDALFactory = ReturnType<typeof appConnectionHealthDALFactory>;

export type TAppConnectionHealthColumn = "syncFailing" | "rotationFailing";

export const appConnectionHealthDALFactory = (db: TDbClient) => {
  const appConnectionHealthOrm = ormify(db, TableName.AppConnectionHealth);

  // Sets the column to `to` only while it holds `from`, so of several runs racing on one connection only the one
  // that actually changes it gets true back.
  const transition = async (
    {
      connectionId,
      column,
      from,
      to
    }: { connectionId: string; column: TAppConnectionHealthColumn; from: boolean; to: boolean },
    tx?: Knex
  ) => {
    try {
      const changed = await (tx || db)(TableName.AppConnectionHealth)
        .where({ connectionId, [column]: from } as Partial<TAppConnectionHealth>)
        .update({ [column]: to } as Partial<TAppConnectionHealth>)
        .returning("id");
      return changed.length > 0;
    } catch (error) {
      throw new DatabaseError({ error, name: "Transition app connection health" });
    }
  };

  // Records that the connection works when nothing was known yet: creates the row, or fills a null column, and
  // leaves a value that is already set alone.
  const markWorkingIfUnknown = async (
    { connectionId, column }: { connectionId: string; column: TAppConnectionHealthColumn },
    tx?: Knex
  ) => {
    try {
      await (tx || db)(TableName.AppConnectionHealth)
        .insert({ connectionId, [column]: false } as TAppConnectionHealthInsert)
        .onConflict("connectionId")
        .merge({ [column]: false } as Partial<TAppConnectionHealth>)
        .whereNull(`${TableName.AppConnectionHealth}.${column}`);
    } catch (error) {
      throw new DatabaseError({ error, name: "Mark app connection health working" });
    }
  };

  return { ...appConnectionHealthOrm, transition, markWorkingIfUnknown };
};
