import { TDbClient } from "@app/db";
import { TableName, TScimEvents } from "@app/db/schemas";
import { ormify, TOrmify } from "@app/lib/knex";

export type TScimEventsDALFactory = TOrmify<TableName.ScimEvents> & {
  findEventsByOrgId: (orgId: string, fromDate: Date, limit: number, offset: number) => Promise<TScimEvents[]>;
};

export const scimEventsDALFactory = (db: TDbClient): TScimEventsDALFactory => {
  const scimEventsOrm = ormify(db, TableName.ScimEvents);

  const findEventsByOrgId = async (orgId: string, fromDate: Date, limit: number, offset: number) => {
    const events = await db(TableName.ScimEvents)
      .where({ orgId })
      .andWhere("createdAt", ">=", fromDate)
      .andWhere("createdAt", "<=", new Date())
      .orderBy("createdAt", "desc")
      .limit(limit)
      .offset(offset);

    return events;
  };

  return {
    ...scimEventsOrm,
    findEventsByOrgId
  };
};
