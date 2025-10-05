import { Knex } from "knex";

import { AccessScope, TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasNamespaceTable = await knex.schema.hasTable(TableName.Namespace);
  if (!hasNamespaceTable) {
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

  const hasMembershipTable = await knex.schema.hasTable(TableName.Membership);
  if (!hasMembershipTable) {
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

      t.boolean("isActive").defaultTo(true).notNullable();
      t.string("status");
      t.string("inviteEmail");
      t.datetime("lastInvitedAt");
      t.string("lastLoginAuthMethod");
      t.datetime("lastLoginTime");
      t.specificType("projectFavorites", "text[]");
      t.timestamps(true, true, true);

      t.index(["scope", "scopeOrgId"]);

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

  const hasRoleTable = await knex.schema.hasTable(TableName.Role);
  if (!hasRoleTable) {
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

    await knex.schema.raw(`
      CREATE UNIQUE INDEX role_name_org_id_unique
      ON "${TableName.Role}" (name, "orgId")
      WHERE "orgId" IS NOT NULL;
    `);

    await knex.schema.raw(`
      CREATE UNIQUE INDEX role_name_project_id_unique
      ON "${TableName.Role}" (name, "projectId")
      WHERE "projectId" IS NOT NULL;
    `);

    await knex.schema.raw(`
      CREATE UNIQUE INDEX role_name_namespace_id_unique
      ON "${TableName.Role}" (name, "namespaceId")
      WHERE "namespaceId" IS NOT NULL;
    `);

    await createOnUpdateTrigger(knex, TableName.Role);
  }

  const hasMembershipRoleTable = await knex.schema.hasTable(TableName.MembershipRole);
  if (!hasMembershipRoleTable) {
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

      t.index("membershipId");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.MembershipRole);
  }

  const hasAdditionalPrivilegeTable = await knex.schema.hasTable(TableName.AdditionalPrivilege);
  if (!hasAdditionalPrivilegeTable) {
    await knex.schema.createTable(TableName.AdditionalPrivilege, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 60).notNullable();
      t.boolean("isTemporary").notNullable().defaultTo(false);
      t.string("temporaryMode");
      t.string("temporaryRange"); // could be cron or relative time like 1H or 1minute etc
      t.datetime("temporaryAccessStartTime");
      t.datetime("temporaryAccessEndTime");
      t.jsonb("permissions").notNullable();

      t.uuid("actorUserId");
      t.foreign("actorUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("actorIdentityId");
      t.foreign("actorIdentityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");

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

      t.check(
        `(:actorUserIdColumn: IS NOT NULL AND :actorIdentityIdColumn: IS NULL) OR
         (:actorIdentityIdColumn: IS NOT NULL AND :actorUserIdColumn: IS NULL)
         `,
        {
          actorUserIdColumn: "actorUserId",
          actorIdentityIdColumn: "actorIdentityId"
        },
        "only_one_actor_type"
      );
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AdditionalPrivilege);
  }

  // no mean this has been created before
  if (!hasMembershipTable) {
    await knex(TableName.Membership).insert(
      // @ts-expect-error never mind
      knex(TableName.OrgMembership).select(
        "id",
        "status",
        "inviteEmail",
        "createdAt",
        "updatedAt",
        "userId as actorUserId",
        "orgId as scopeOrgId",
        "projectFavorites",
        "isActive",
        "lastInvitedAt",
        "lastLoginAuthMethod",
        "lastLoginTime",
        knex.raw("? as scope", [AccessScope.Organization])
      )
    );
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
