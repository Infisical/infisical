import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.EndpointDeviceCommand))) {
    await knex.schema.createTable(TableName.EndpointDeviceCommand, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("deviceId").notNullable();
      t.foreign("deviceId").references("id").inTable(TableName.EndpointDevice).onDelete("CASCADE");

      t.string("status", 32).notNullable();

      // The program and its arguments are stored apart so the agent can exec the argv directly.
      // 'shell' is what the operator asked for, not a detail of how we store it: with it set the
      // command is one script handed to a shell, and pipes and globs work; without it there is no
      // shell on the device at all, so nothing in args can be interpreted as syntax.
      t.boolean("shell").notNullable().defaultTo(false);
      t.text("command").notNullable();
      t.jsonb("args").notNullable().defaultTo("[]");

      t.integer("timeoutSeconds").notNullable();

      // A device can be off for a week. Without this the command would fire the moment the laptop
      // came back, which is long after whoever issued it stopped expecting it to.
      t.datetime("expiresAt").notNullable();

      // SET NULL rather than CASCADE: the record of what was run on an employee's machine has to
      // outlive the account that ran it, which is the whole point of keeping it.
      t.uuid("requestedByUserId");
      t.foreign("requestedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      // Denormalised so the log still names someone after the account is gone.
      t.string("requestedByEmail", 255);
      t.string("reason", 500);

      t.datetime("dispatchedAt");
      t.datetime("completedAt");

      t.integer("exitCode");
      t.text("stdout");
      t.text("stderr");
      // Set when the agent hit the output cap, so the console can say the output is partial rather
      // than letting someone read a truncated stdout as the whole story.
      t.boolean("outputTruncated").notNullable().defaultTo(false);
      // Why the agent could not run it at all — a missing binary, a permission error. Distinct from
      // a non-zero exit, which means it ran and failed.
      t.text("error");

      // The console lists one device newest-first.
      t.index(["deviceId", "createdAt"]);
      // The agent claim reads exactly this: my device, still pending. Partial so it stays the size
      // of the queue rather than the size of the history.
      t.index(["deviceId", "status"]);
      t.index(["requestedByUserId"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EndpointDeviceCommand);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.EndpointDeviceCommand);
  await dropOnUpdateTrigger(knex, TableName.EndpointDeviceCommand);
}
