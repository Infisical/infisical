import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.EndpointTarget))) {
    await knex.schema.createTable(TableName.EndpointTarget, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.string("name").notNullable();

      // 'domain' is a name the device resolves to a local listener; 'ip' is a private address the
      // device claims locally. The two differ only in how the device provisions the address it
      // listens on, which is why one table carries both.
      t.string("kind").notNullable();

      // What the person on the device types: a hostname for a domain target, an IP literal for an
      // IP target.
      t.string("destination").notNullable();

      // Where the GATEWAY dials, when that is not the destination itself. A domain target needs this
      // whenever the gateway's own DNS cannot resolve the name the device uses.
      t.string("ip");

      t.integer("port").notNullable();

      // The address the DEVICE listens on for a domain target, allocated per destination so two
      // targets on the same host (:80 and :443) share one /etc/hosts entry rather than fighting over
      // it. Null for an IP target, which listens on the destination address itself.
      t.string("loopbackIp");

      // Nullable and SET NULL to match every other gateway reference in the schema: deleting a
      // gateway must not delete the admin's targets. A target with no gateway cannot be dialled, and
      // the console and the connect route both say so.
      t.uuid("gatewayId");
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");
      t.index("gatewayId");

      t.boolean("isEnabled").notNullable().defaultTo(true);

      // Two targets for the same address and port would produce two listeners on one socket, so the
      // conflict is rejected at write time rather than discovered on the device.
      t.unique(["projectId", "destination", "port"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EndpointTarget);
  }

  if (!(await knex.schema.hasTable(TableName.EndpointTargetAssignment))) {
    await knex.schema.createTable(TableName.EndpointTargetAssignment, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("targetId").notNullable();
      t.foreign("targetId").references("id").inTable(TableName.EndpointTarget).onDelete("CASCADE");

      t.uuid("deviceId").notNullable();
      t.foreign("deviceId").references("id").inTable(TableName.EndpointDevice).onDelete("CASCADE");
      // The unique below covers targetId as its leftmost column; deviceId needs its own index
      // because the hot read is "every target assigned to this device", on every agent config pull.
      t.index("deviceId");

      t.unique(["targetId", "deviceId"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EndpointTargetAssignment);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.EndpointTargetAssignment);
  await dropOnUpdateTrigger(knex, TableName.EndpointTargetAssignment);

  await knex.schema.dropTableIfExists(TableName.EndpointTarget);
  await dropOnUpdateTrigger(knex, TableName.EndpointTarget);
}
