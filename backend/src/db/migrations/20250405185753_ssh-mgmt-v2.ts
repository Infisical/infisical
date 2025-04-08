import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SshHost))) {
    await knex.schema.createTable(TableName.SshHost, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("hostname").notNullable();
      t.string("userCertTtl").notNullable();
      t.string("hostCertTtl").notNullable();
      t.uuid("userSshCaId").notNullable();
      t.foreign("userSshCaId").references("id").inTable(TableName.SshCertificateAuthority).onDelete("CASCADE");
      t.uuid("hostSshCaId").notNullable();
      t.foreign("hostSshCaId").references("id").inTable(TableName.SshCertificateAuthority).onDelete("CASCADE");
      t.unique(["projectId", "hostname"]);
    });
    await createOnUpdateTrigger(knex, TableName.SshHost);
  }

  if (!(await knex.schema.hasTable(TableName.SshHostLoginMapping))) {
    await knex.schema.createTable(TableName.SshHostLoginMapping, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("sshHostId").notNullable();
      t.foreign("sshHostId").references("id").inTable(TableName.SshHost).onDelete("CASCADE");
      t.string("loginUser").notNullable();
      t.specificType("allowedPrincipals", "text[]").notNullable();
    });
    await createOnUpdateTrigger(knex, TableName.SshHostLoginMapping);
  }

  if (!(await knex.schema.hasTable(TableName.ProjectSshConfig))) {
    // new table to store configuration for projects of type SSH (i.e. Infisical SSH)
    await knex.schema.createTable(TableName.ProjectSshConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("defaultUserSshCaId");
      t.foreign("defaultUserSshCaId").references("id").inTable(TableName.SshCertificateAuthority).onDelete("CASCADE");
      t.uuid("defaultHostSshCaId");
      t.foreign("defaultHostSshCaId").references("id").inTable(TableName.SshCertificateAuthority).onDelete("CASCADE");
    });
    await createOnUpdateTrigger(knex, TableName.ProjectSshConfig);
  }

  const hasColumn = await knex.schema.hasColumn(TableName.SshCertificate, "sshHostId");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.SshCertificate, (t) => {
      t.uuid("sshHostId").nullable();
      t.foreign("sshHostId").references("id").inTable(TableName.SshHost).onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ProjectSshConfig);
  await dropOnUpdateTrigger(knex, TableName.ProjectSshConfig);

  await knex.schema.dropTableIfExists(TableName.SshHostLoginMapping);
  await dropOnUpdateTrigger(knex, TableName.SshHostLoginMapping);

  await knex.schema.dropTableIfExists(TableName.SshHost);
  await dropOnUpdateTrigger(knex, TableName.SshHost);

  const hasColumn = await knex.schema.hasColumn(TableName.SshCertificate, "sshHostId");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.SshCertificate, (t) => {
      t.dropColumn("sshHostId");
    });
  }
}
