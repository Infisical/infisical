import { Knex } from "knex";

import { AccessScope, TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const createNamespaceTable = async (knex: Knex) => {
  await knex.schema.createTable(TableName.Namespace, (t) => {
    t.uuid("id").primary().defaultTo(knex.fn.uuid());
    t.string("name").notNullable();
    t.string("description");
    t.uuid("orgId").notNullable();
    t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    t.timestamps(true, true, true);
  });

  await createOnUpdateTrigger(knex, TableName.Namespace);
};

const createMembershipTable = async (knex: Knex) => {
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
};

const createRoleTable = async (knex: Knex) => {
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
};

const createMembershipRoleTable = async (knex: Knex) => {
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
};

const createAdditionalPrivilegeTable = async (knex: Knex) => {
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
};

const migrateMembershipData = async (knex: Knex) => {
  await knex
    .insert(
      knex(TableName.OrgMembership).select(
        "id",
        "status",
        "inviteEmail",
        "createdAt",
        "updatedAt",
        "userId",
        "orgId",
        "projectFavorites",
        "isActive",
        "lastInvitedAt",
        "lastLoginAuthMethod",
        "lastLoginTime",
        knex.raw("?", [AccessScope.Organization])
      )
    )
    .into(
      knex.raw("?? (??, ??, ??, ??, ??, ??, ??, ??, ??, ??, ??, ??, ??)", [
        TableName.Membership,
        "id",
        "status",
        "inviteEmail",
        "createdAt",
        "updatedAt",
        "actorUserId",
        "scopeOrgId",
        "projectFavorites",
        "isActive",
        "lastInvitedAt",
        "lastLoginAuthMethod",
        "lastLoginTime",
        "scope"
      ])
    );

  await knex
    .insert(
      knex(TableName.IdentityOrgMembership).select(
        "id",
        "identityId",
        "orgId",
        "lastLoginAuthMethod",
        "lastLoginTime",
        "createdAt",
        "updatedAt",
        knex.raw("?", [AccessScope.Organization])
      )
    )
    .into(
      knex.raw("?? (??, ??, ??, ??, ??, ??, ??, ??)", [
        TableName.Membership,
        "id",
        "actorIdentityId",
        "scopeOrgId",
        "lastLoginAuthMethod",
        "lastLoginTime",
        "createdAt",
        "updatedAt",
        "scope"
      ])
    );

  await knex
    .insert(
      knex(TableName.Groups).select("id", "orgId", "createdAt", "updatedAt", knex.raw("?", [AccessScope.Organization]))
    )
    .into(
      knex.raw("?? (??, ??, ??, ??, ??)", [
        TableName.Membership,
        "actorGroupId",
        "scopeOrgId",
        "createdAt",
        "updatedAt",
        "scope"
      ])
    );

  await knex
    .insert(
      knex(TableName.ProjectMembership)
        .join(TableName.Project, `${TableName.ProjectMembership}.projectId`, `${TableName.Project}.id`)
        .select(
          knex.ref("id").withSchema(TableName.ProjectMembership),
          "userId",
          "projectId",
          "orgId",
          knex.ref("createdAt").withSchema(TableName.ProjectMembership),
          knex.ref("updatedAt").withSchema(TableName.ProjectMembership),
          knex.raw("?", [AccessScope.Project])
        )
    )
    .into(
      knex.raw("?? (??, ??, ??, ??, ??, ??, ??)", [
        TableName.Membership,
        "id",
        "actorUserId",
        "scopeProjectId",
        "scopeOrgId",
        "createdAt",
        "updatedAt",
        "scope"
      ])
    );

  await knex
    .insert(
      knex(TableName.IdentityProjectMembership)
        .join(TableName.Project, `${TableName.IdentityProjectMembership}.projectId`, `${TableName.Project}.id`)
        .select(
          knex.ref("id").withSchema(TableName.IdentityProjectMembership),
          "identityId",
          "projectId",
          "orgId",
          knex.ref("createdAt").withSchema(TableName.IdentityProjectMembership),
          knex.ref("updatedAt").withSchema(TableName.IdentityProjectMembership),
          knex.raw("?", [AccessScope.Project])
        )
    )
    .into(
      knex.raw("?? (??, ??, ??, ??, ??, ??, ??)", [
        TableName.Membership,
        "id",
        "actorIdentityId",
        "scopeProjectId",
        "scopeOrgId",
        "createdAt",
        "updatedAt",
        "scope"
      ])
    );

  await knex
    .insert(
      knex(TableName.GroupProjectMembership)
        .join(TableName.Project, `${TableName.GroupProjectMembership}.projectId`, `${TableName.Project}.id`)
        .select(
          knex.ref("id").withSchema(TableName.GroupProjectMembership),
          "groupId",
          "projectId",
          "orgId",
          knex.ref("createdAt").withSchema(TableName.GroupProjectMembership),
          knex.ref("updatedAt").withSchema(TableName.GroupProjectMembership),
          knex.raw("?", [AccessScope.Project])
        )
    )
    .into(
      knex.raw("?? (??, ??, ??, ??, ??, ??, ??)", [
        TableName.Membership,
        "id",
        "actorGroupId",
        "scopeProjectId",
        "scopeOrgId",
        "createdAt",
        "updatedAt",
        "scope"
      ])
    );
};

const migrateRoleData = async (knex: Knex) => {
  await knex
    .insert(
      knex(TableName.OrgRoles).select(
        "id",
        "name",
        "description",
        "slug",
        "permissions",
        "createdAt",
        "updatedAt",
        "orgId"
      )
    )
    .into(
      knex.raw("?? (??, ??, ??, ??, ??, ??, ??, ??)", [
        TableName.Role,
        "id",
        "name",
        "description",
        "slug",
        "permissions",
        "createdAt",
        "updatedAt",
        "orgId"
      ])
    );

  await knex
    .insert(
      knex(TableName.ProjectRoles).select(
        "id",
        "name",
        "description",
        "slug",
        "permissions",
        "createdAt",
        "updatedAt",
        "projectId"
      )
    )
    .into(
      knex.raw("?? (??, ??, ??, ??, ??, ??, ??, ??)", [
        TableName.Role,
        "id",
        "name",
        "description",
        "slug",
        "permissions",
        "createdAt",
        "updatedAt",
        "projectId"
      ])
    );

  const hasExternalGroupRoleMappingRoleColumn = await knex.schema.hasColumn(
    TableName.ExternalGroupOrgRoleMapping,
    "roleId"
  );
  if (hasExternalGroupRoleMappingRoleColumn) {
    await knex.schema.alterTable(TableName.ExternalGroupOrgRoleMapping, (t) => {
      t.dropForeign("roleId");
      t.foreign("roleId").references("id").inTable(TableName.Role);
    });
  }
};

const migrateMembershipRoleData = async (knex: Knex) => {
  await knex
    .insert(knex(TableName.OrgMembership).select("id", "role", "roleId"))
    .into(knex.raw("?? (??, ??, ??)", [TableName.MembershipRole, "membershipId", "role", "customRoleId"]));

  await knex
    .insert(knex(TableName.IdentityOrgMembership).select("id", "role", "roleId"))
    .into(knex.raw("?? (??, ??, ??)", [TableName.MembershipRole, "membershipId", "role", "customRoleId"]));

  await knex
    .insert(
      knex(TableName.Groups)
        .join(TableName.Membership, (qb) => {
          qb.on(`${TableName.Groups}.id`, `${TableName.Membership}.actorGroupId`)
            .andOn(`${TableName.Groups}.orgId`, `${TableName.Membership}.scopeOrgId`)
            .andOn(`${TableName.Membership}.scope`, knex.raw("?", [AccessScope.Organization]));
        })
        .select(knex.ref("id").withSchema(TableName.Membership), "role", "roleId")
    )
    .into(knex.raw("?? (??, ??, ??)", [TableName.MembershipRole, "membershipId", "role", "customRoleId"]));

  await knex
    .insert(
      knex(TableName.ProjectUserMembershipRole).select(
        "id",
        "role",
        "projectMembershipId",
        "customRoleId",
        "isTemporary",
        "temporaryMode",
        "temporaryRange",
        "temporaryAccessStartTime",
        "temporaryAccessEndTime",
        "createdAt",
        "updatedAt"
      )
    )
    .into(
      knex.raw("?? (??,??,??,??,??,??,??,??,??,??,??)", [
        TableName.MembershipRole,
        "id",
        "role",
        "membershipId",
        "customRoleId",
        "isTemporary",
        "temporaryMode",
        "temporaryRange",
        "temporaryAccessStartTime",
        "temporaryAccessEndTime",
        "createdAt",
        "updatedAt"
      ])
    );

  await knex
    .insert(
      knex(TableName.IdentityProjectMembershipRole).select(
        "id",
        "role",
        "projectMembershipId",
        "customRoleId",
        "isTemporary",
        "temporaryMode",
        "temporaryRange",
        "temporaryAccessStartTime",
        "temporaryAccessEndTime",
        "createdAt",
        "updatedAt"
      )
    )
    .into(
      knex.raw("?? (??,??,??,??,??,??,??,??,??,??,??)", [
        TableName.MembershipRole,
        "id",
        "role",
        "membershipId",
        "customRoleId",
        "isTemporary",
        "temporaryMode",
        "temporaryRange",
        "temporaryAccessStartTime",
        "temporaryAccessEndTime",
        "createdAt",
        "updatedAt"
      ])
    );

  await knex
    .insert(
      knex(TableName.GroupProjectMembershipRole).select(
        "id",
        "role",
        "projectMembershipId",
        "customRoleId",
        "isTemporary",
        "temporaryMode",
        "temporaryRange",
        "temporaryAccessStartTime",
        "temporaryAccessEndTime",
        "createdAt",
        "updatedAt"
      )
    )
    .into(
      knex.raw("?? (??,??,??,??,??,??,??,??,??,??,??)", [
        TableName.MembershipRole,
        "id",
        "role",
        "membershipId",
        "customRoleId",
        "isTemporary",
        "temporaryMode",
        "temporaryRange",
        "temporaryAccessStartTime",
        "temporaryAccessEndTime",
        "createdAt",
        "updatedAt"
      ])
    );
};

const migrateAdditionalPrivilegeData = async (knex: Knex) => {
  await knex
    .insert(
      knex(TableName.ProjectUserAdditionalPrivilege).select(
        "id",
        "slug",
        "isTemporary",
        "temporaryMode",
        "temporaryRange",
        "temporaryAccessStartTime",
        "temporaryAccessEndTime",
        "permissions",
        "userId",
        "projectId",
        "createdAt",
        "updatedAt"
      )
    )
    .into(
      knex.raw("?? (??,??,??,??,??,??,??,??,??,??,??,??)", [
        TableName.AdditionalPrivilege,
        "id",
        "name",
        "isTemporary",
        "temporaryMode",
        "temporaryRange",
        "temporaryAccessStartTime",
        "temporaryAccessEndTime",
        "permissions",
        "actorUserId",
        "projectId",
        "createdAt",
        "updatedAt"
      ])
    );

  await knex
    .insert(
      knex(TableName.IdentityProjectAdditionalPrivilege)
        .join(
          TableName.IdentityProjectMembership,
          `${TableName.IdentityProjectMembership}.id`,
          `${TableName.IdentityProjectAdditionalPrivilege}.projectMembershipId`
        )
        .select(
          knex.ref("id").withSchema(TableName.IdentityProjectAdditionalPrivilege),
          "slug",
          "isTemporary",
          "temporaryMode",
          "temporaryRange",
          "temporaryAccessStartTime",
          "temporaryAccessEndTime",
          "permissions",
          "identityId",
          "projectId",
          knex.ref("createdAt").withSchema(TableName.IdentityProjectAdditionalPrivilege),
          knex.ref("updatedAt").withSchema(TableName.IdentityProjectAdditionalPrivilege)
        )
    )
    .into(
      knex.raw("?? (??,??,??,??,??,??,??,??,??,??,??,??)", [
        TableName.AdditionalPrivilege,
        "id",
        "name",
        "isTemporary",
        "temporaryMode",
        "temporaryRange",
        "temporaryAccessStartTime",
        "temporaryAccessEndTime",
        "permissions",
        "actorIdentityId",
        "projectId",
        "createdAt",
        "updatedAt"
      ])
    );

  const hasApColumnInAccessApprovalRequest = await knex.schema.hasColumn(
    TableName.AccessApprovalRequest,
    "privilegeId"
  );
  if (hasApColumnInAccessApprovalRequest) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.dropForeign("privilegeId");
      t.foreign("privilegeId").references("id").inTable(TableName.AdditionalPrivilege);
    });
  }
};

export async function up(knex: Knex): Promise<void> {
  const hasToMigrateNamespaceTable = !(await knex.schema.hasTable(TableName.Namespace));
  if (hasToMigrateNamespaceTable) {
    await createNamespaceTable(knex);
  }

  const hasToMigrateMembershipTable = !(await knex.schema.hasTable(TableName.Membership));
  if (hasToMigrateMembershipTable) {
    await createMembershipTable(knex);
  }

  const hasToMigrateRoleTable = !(await knex.schema.hasTable(TableName.Role));
  if (hasToMigrateRoleTable) {
    await createRoleTable(knex);
  }

  const hasToMigrateMembershipRoleTable = !(await knex.schema.hasTable(TableName.MembershipRole));
  if (hasToMigrateMembershipRoleTable) {
    await createMembershipRoleTable(knex);
  }

  const hasToMigrateAdditionalPrivilegeTable = !(await knex.schema.hasTable(TableName.AdditionalPrivilege));
  if (hasToMigrateAdditionalPrivilegeTable) {
    await createAdditionalPrivilegeTable(knex);
  }

  // no mean this has been created before
  if (hasToMigrateMembershipTable) {
    await migrateMembershipData(knex);
  }

  if (hasToMigrateRoleTable) {
    await migrateRoleData(knex);
  }

  if (hasToMigrateMembershipRoleTable) {
    await migrateMembershipRoleData(knex);
  }

  if (hasToMigrateAdditionalPrivilegeTable) {
    await migrateAdditionalPrivilegeData(knex);
  }
}

export async function down(knex: Knex): Promise<void> {
  // we can bring fk to these tables because the data may not exist anymore
  // we can do insert back with merge conflict merge in
  const hasApColumnInAccessApprovalRequest = await knex.schema.hasColumn(
    TableName.AccessApprovalRequest,
    "privilegeId"
  );
  if (hasApColumnInAccessApprovalRequest) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.dropForeign("privilegeId");
      t.foreign("privilegeId").references("id").inTable(TableName.ProjectUserAdditionalPrivilege);
    });
  }

  const hasExternalGroupRoleMappingRoleColumn = await knex.schema.hasColumn(
    TableName.ExternalGroupOrgRoleMapping,
    "roleId"
  );
  if (hasExternalGroupRoleMappingRoleColumn) {
    await knex.schema.alterTable(TableName.ExternalGroupOrgRoleMapping, (t) => {
      t.dropForeign("roleId");
      t.foreign("roleId").references("id").inTable(TableName.OrgRoles);
    });
  }

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
