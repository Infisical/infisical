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

  if (!(await knex.schema.hasTable(TableName.Membership))) {
    await knex.schema.createTable(TableName.Membership, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.string("scope", 24).notNullable();

      t.uuid("actorUserId");
      t.foreign("actorUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("actorIdentityId");
      t.foreign("actorIdentityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      t.uuid("actorGroupId");
      t.foreign("actorGroupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");

      t.uuid("scopeOrgId").notNullable();
      t.foreign("scopeOrgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("scopeProjectId", 36);
      t.foreign("scopeProjectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("scopeNamespaceId");
      t.foreign("scopeNamespaceId").references("id").inTable(TableName.Namespace).onDelete("CASCADE");

      t.boolean("isActive");
      t.string("status").defaultTo("invited");
      t.string("inviteEmail");
      t.datetime("lastInvitedAt");
      t.datetime("lastLoginAuthMethod");
      t.datetime("lastLoginTime");
      t.specificType("projectFavorites", "text[]");
      t.timestamps(true, true, true);

      t.check(
        `(:actorUserIdColumn: IS NOT NULL AND :actorIdentityIdColumn: IS NULL AND :actorGroupIdColumn: IS NULL) OR
         (:actorIdentityIdColumn: IS NOT NULL AND :actorUserIdColumn: IS NULL AND :actorGroupIdColumn: IS NULL) OR
         (:actorGroupIdColumn: IS NOT NULL AND :actorUserIdColumn: IS NULL AND :actorIdentityIdColumn: IS NULL)`,
        {
          actorUserIdColumn: "actorUserId",
          actorIdentityIdColumn: "actorIdentityId",
          actorGroupIdColumn: "actorGroupId"
        },
        "only_one_actor_type"
      );

      t.check(
        `(:scopeColumn: = 'namespace' AND :scopeNamespaceIdColumn: IS NOT NULL) OR
         (:scopeColumn: = 'project' AND :scopeProjectIdColumn: IS NOT NULL) OR
         (:scopeColumn: = 'organization')
         `,
        {
          scopeColumn: "scope",
          scopeNamespaceIdColumn: "scopeNamespaceId",
          scopeProjectIdColumn: "scopeProjectId"
        },
        "scope_matches_id"
      );
    });

    await createOnUpdateTrigger(knex, TableName.Membership);
  }

  if (!(await knex.schema.hasTable(TableName.Role))) {
    await knex.schema.createTable(TableName.Role, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("description");
      t.string("slug").notNullable();
      t.jsonb("permissions").notNullable();

      t.uuid("orgId");
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("projectId", 36);
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("namespaceId");
      t.foreign("namespaceId").references("id").inTable(TableName.Namespace).onDelete("CASCADE");

      t.check(
        `(:orgIdColumn: IS NOT NULL AND :namespaceIdColumn: IS NULL AND :projectIdColumn: IS NULL) OR
         (:namespaceIdColumn: IS NOT NULL AND :orgIdColumn: IS NULL AND :projectIdColumn: IS NULL) OR
         (:projectIdColumn: IS NOT NULL AND :orgIdColumn: IS NULL AND :namespaceIdColumn: IS NULL)`,
        {
          orgIdColumn: "orgId",
          namespaceIdColumn: "namespaceId",
          projectIdColumn: "projectId"
        },
        "only_one_scope_id"
      );

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.Role);
  }

  if (!(await knex.schema.hasTable(TableName.MembershipRole))) {
    await knex.schema.createTable(TableName.MembershipRole, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.string("role").notNullable();
      t.boolean("isTemporary").notNullable().defaultTo(false);
      t.string("temporaryMode");
      t.string("temporaryRange"); // could be cron or relative time like 1H or 1minute etc
      t.datetime("temporaryAccessStartTime");
      t.datetime("temporaryAccessEndTime");

      t.uuid("customRoleId");
      t.foreign("customRoleId").references("id").inTable(TableName.Role);
      t.uuid("membershipId").notNullable();
      t.foreign("membershipId").references("id").inTable(TableName.Membership).onDelete("CASCADE");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.MembershipRole);
  }

  if (!(await knex.schema.hasTable(TableName.AdditionalPrivilege))) {
    await knex.schema.createTable(TableName.AdditionalPrivilege, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 60).notNullable();
      t.boolean("isTemporary").notNullable().defaultTo(false);
      t.string("temporaryMode");
      t.string("temporaryRange"); // could be cron or relative time like 1H or 1minute etc
      t.datetime("temporaryAccessStartTime");
      t.datetime("temporaryAccessEndTime");
      t.jsonb("permissions").notNullable();

      t.uuid("membershipId").notNullable();
      t.foreign("membershipId").references("id").inTable(TableName.Membership).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AdditionalPrivilege);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.AdditionalPrivilege);
  await knex.schema.dropTableIfExists(TableName.AdditionalPrivilege);

  await dropOnUpdateTrigger(knex, TableName.MembershipRole);
  await knex.schema.dropTableIfExists(TableName.MembershipRole);

  await dropOnUpdateTrigger(knex, TableName.Membership);
  await knex.schema.dropTableIfExists(TableName.Membership);

  await dropOnUpdateTrigger(knex, TableName.Role);
  await knex.schema.dropTableIfExists(TableName.Role);

  await dropOnUpdateTrigger(knex, TableName.Namespace);
  await knex.schema.dropTableIfExists(TableName.Namespace);
}
