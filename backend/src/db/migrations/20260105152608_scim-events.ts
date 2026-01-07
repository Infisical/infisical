import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const formatPartitionDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const createScimEventsPartition = async (knex: Knex, startDate: Date, endDate: Date) => {
  const startDateStr = formatPartitionDate(startDate);
  const endDateStr = formatPartitionDate(endDate);

  const partitionName = `${TableName.ScimEvents}_${startDateStr.replace(/-/g, "")}_${endDateStr.replace(/-/g, "")}`;

  await knex.schema.raw(
    `CREATE TABLE ${partitionName} PARTITION OF ${TableName.ScimEvents} FOR VALUES FROM ('${startDateStr}') TO ('${endDateStr}')`
  );
};

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ScimEvents))) {
    const createTableSql = knex.schema
      .createTable(TableName.ScimEvents, (t) => {
        t.uuid("id").defaultTo(knex.fn.uuid());
        t.uuid("orgId").notNullable();
        t.string("eventType");
        t.jsonb("event");

        t.timestamps(true, true, true);
        t.primary(["id", "createdAt"]);
      })
      .toString();

    await knex.schema.raw(`
        ${createTableSql} PARTITION BY RANGE ("createdAt");
    `);

    await knex.schema.raw(`CREATE TABLE ${TableName.ScimEvents}_default PARTITION OF ${TableName.ScimEvents} DEFAULT`);

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);

    await createScimEventsPartition(knex, nextDate, new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 1));

    const partitionMonths = 20 * 12;
    const partitionPromises: Promise<void>[] = [];
    for (let x = 1; x <= partitionMonths; x += 1) {
      partitionPromises.push(
        createScimEventsPartition(
          knex,
          new Date(nextDate.getFullYear(), nextDate.getMonth() + x, 1),
          new Date(nextDate.getFullYear(), nextDate.getMonth() + (x + 1), 1)
        )
      );
    }

    await Promise.all(partitionPromises);

    await knex.schema.alterTable(TableName.ScimEvents, (t) => {
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.index(["orgId", "eventType"]);
    });

    await createOnUpdateTrigger(knex, TableName.ScimEvents);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ScimEvents);
  await dropOnUpdateTrigger(knex, TableName.ScimEvents);
}
