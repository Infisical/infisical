import { Knex } from "knex";
import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Namespace))) {
    await knex.schema.createTable(TableName.Namespace, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("description");
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.Namespace);
  }

  if (!(await knex.schema.hasTable(TableName.NamespaceMembership))) {
    await knex.schema.createTable(TableName.NamespaceMembership, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.uuid("orgUserMembershipId");
      t.foreign("orgUserMembershipId").references("id").inTable(TableName.OrgMembership).onDelete("CASCADE");
      t.uuid("orgIdentityMembershipId");
      t.foreign("orgIdentityMembershipId")
        .references("id")
        .inTable(TableName.IdentityOrgMembership)
        .onDelete("CASCADE");
      t.timestamps(true, true, true);
      t.check(
        "(:orgUserMembership: IS NOT NULL AND :orgIdentityMembership: IS NULL) OR (:orgUserMembership: IS NULL AND :orgIdentityMembership: IS NOT NULL)",
        { orgUserMembership: "orgUserMembershipId", orgIdentityMembership: "orgIdentityMembershipId" },
        "org_user_or_identity"
      );
    });

    await createOnUpdateTrigger(knex, TableName.NamespaceMembership);
  }

  if (!(await knex.schema.hasTable(TableName.NamespaceRoles))) {
    await knex.schema.createTable(TableName.NamespaceRoles, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("description");
      t.string("slug").notNullable();
      t.jsonb("permissions").notNullable();
      t.uuid("namespaceId").notNullable();
      t.foreign("namespaceId").references("id").inTable(TableName.Namespace).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.NamespaceRoles);
  }

  if (!(await knex.schema.hasTable(TableName.NamespaceMembershipRoles))) {
    await knex.schema.createTable(TableName.NamespaceMembershipRoles, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.string("role").notNullable();
      t.uuid("customRoleId");
      t.foreign("customRoleId").references("id").inTable(TableName.NamespaceRoles);
      t.boolean("isTemporary").notNullable().defaultTo(false);
      t.string("temporaryMode");
      t.string("temporaryRange"); // could be cron or relative time like 1H or 1minute etc
      t.datetime("temporaryAccessStartTime");
      t.datetime("temporaryAccessEndTime");
      t.uuid("namespaceMembershipId").notNullable();
      t.foreign("namespaceMembershipId").references("id").inTable(TableName.NamespaceMembership).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.NamespaceMembershipRoles);
  }

  if (!(await knex.schema.hasTable(TableName.NamespaceAdditionalPrivilege))) {
    await knex.schema.createTable(TableName.NamespaceAdditionalPrivilege, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 60).notNullable();
      t.uuid("namespaceMembershipId").notNullable();
      t.foreign("namespaceMembershipId").references("id").inTable(TableName.NamespaceMembership).onDelete("CASCADE");
      t.boolean("isTemporary").notNullable().defaultTo(false);
      t.string("temporaryMode");
      t.string("temporaryRange"); // could be cron or relative time like 1H or 1minute etc
      t.datetime("temporaryAccessStartTime");
      t.datetime("temporaryAccessEndTime");
      t.jsonb("permissions").notNullable();
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.NamespaceAdditionalPrivilege);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.NamespaceAdditionalPrivilege);
  await knex.schema.dropTableIfExists(TableName.NamespaceAdditionalPrivilege);

  await dropOnUpdateTrigger(knex, TableName.NamespaceMembershipRoles);
  await knex.schema.dropTableIfExists(TableName.NamespaceMembershipRoles);

  await dropOnUpdateTrigger(knex, TableName.NamespaceMembership);
  await knex.schema.dropTableIfExists(TableName.NamespaceMembership);

  await dropOnUpdateTrigger(knex, TableName.NamespaceRoles);
  await knex.schema.dropTableIfExists(TableName.NamespaceRoles);

  await dropOnUpdateTrigger(knex, TableName.Namespace);
  await knex.schema.dropTableIfExists(TableName.Namespace);
}
