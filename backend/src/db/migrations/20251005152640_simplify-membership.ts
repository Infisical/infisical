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
    ON "${TableName.Role}" (slug, "orgId")
    WHERE "orgId" IS NOT NULL;
  `);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX role_name_project_id_unique
    ON "${TableName.Role}" (slug, "projectId")
    WHERE "projectId" IS NOT NULL;
  `);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX role_name_namespace_id_unique
    ON "${TableName.Role}" (slug, "namespaceId")
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
  await knex(TableName.OrgMembership).whereNull("userId").del();

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

  // clear orphaned identity project memberships
  await knex(TableName.IdentityOrgMembership)
    .whereNotIn("identityId", knex.select("id").from(TableName.Identity))
    .del();

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

  // clear orphaned identity project memberships
  await knex(TableName.IdentityProjectMembership)
    .whereNotIn("identityId", knex.select("id").from(TableName.Identity))
    .del();

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

  // this means these tables have been created before
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

const rollbackAdditionalPrivilegeData = async (knex: Knex) => {
  const projectUserAdditionalPrivilegeFields = [
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
  ];

  await knex
    .insert(
      knex(TableName.AdditionalPrivilege)
        .whereNotNull("actorUserId")
        .whereNotNull("projectId")
        .select(
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
        )
    )
    .into(
      knex.raw("?? (??,??,??,??,??,??,??,??,??,??,??,??)", [
        TableName.ProjectUserAdditionalPrivilege,
        ...projectUserAdditionalPrivilegeFields
      ])
    )
    .onConflict("id")
    .merge(projectUserAdditionalPrivilegeFields);

  const identityProjectAdditionalPrivilegeFields = [
    "id",
    "slug",
    "isTemporary",
    "temporaryMode",
    "temporaryRange",
    "temporaryAccessStartTime",
    "temporaryAccessEndTime",
    "permissions",
    "projectMembershipId",
    "createdAt",
    "updatedAt"
  ];

  await knex
    .insert(
      knex(TableName.AdditionalPrivilege)
        .join(TableName.Membership, (qb) => {
          qb.on(`${TableName.AdditionalPrivilege}.actorIdentityId`, `${TableName.Membership}.actorIdentityId`)
            .andOn(`${TableName.AdditionalPrivilege}.projectId`, `${TableName.Membership}.scopeProjectId`)
            .andOn(`${TableName.Membership}.scope`, knex.raw("?", [AccessScope.Project]));
        })
        .whereNotNull(`${TableName.AdditionalPrivilege}.actorIdentityId`)
        .whereNotNull(`${TableName.AdditionalPrivilege}.projectId`)
        .select(
          knex.ref("id").withSchema(TableName.AdditionalPrivilege),
          "name",
          "isTemporary",
          "temporaryMode",
          "temporaryRange",
          "temporaryAccessStartTime",
          "temporaryAccessEndTime",
          "permissions",
          knex.ref("id").withSchema(TableName.Membership).as("projectMembershipId"),
          knex.ref("createdAt").withSchema(TableName.AdditionalPrivilege),
          knex.ref("updatedAt").withSchema(TableName.AdditionalPrivilege)
        )
    )
    .into(
      knex.raw("?? (??,??,??,??,??,??,??,??,??,??,??)", [
        TableName.IdentityProjectAdditionalPrivilege,
        ...identityProjectAdditionalPrivilegeFields
      ])
    )
    .onConflict("id")
    .merge(identityProjectAdditionalPrivilegeFields);
};

const rollbackMembershipRoleData = async (knex: Knex) => {
  const groupRoleFields = ["id", "name", "slug", "createdAt", "updatedAt", "role", "roleId", "orgId"];

  await knex
    .insert(
      knex(TableName.MembershipRole)
        .join(TableName.Membership, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .join(TableName.Groups, `${TableName.Membership}.actorGroupId`, `${TableName.Groups}.id`)
        .whereNotNull(`${TableName.Membership}.actorGroupId`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .select(
          knex.ref("actorGroupId").withSchema(TableName.Membership),
          knex.ref("name").withSchema(TableName.Groups),
          knex.ref("slug").withSchema(TableName.Groups),
          knex.ref("createdAt").withSchema(TableName.Groups),
          knex.ref("updatedAt").withSchema(TableName.Groups),
          knex.ref("role").withSchema(TableName.MembershipRole),
          "customRoleId",
          knex.ref("orgId").withSchema(TableName.Groups)
        )
    )
    .into(knex.raw("?? (??,??,??,??,??,??,??,??)", [TableName.Groups, ...groupRoleFields]))
    .onConflict("id")
    .merge(groupRoleFields);

  const projectMembershipRoleFields = [
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
  ];

  await knex
    .insert(
      knex(TableName.MembershipRole)
        .join(TableName.Membership, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .select(
          knex.ref("id").withSchema(TableName.MembershipRole),
          "role",
          knex.ref("membershipId").withSchema(TableName.MembershipRole),
          "customRoleId",
          "isTemporary",
          "temporaryMode",
          "temporaryRange",
          "temporaryAccessStartTime",
          "temporaryAccessEndTime",
          knex.ref("createdAt").withSchema(TableName.MembershipRole),
          knex.ref("updatedAt").withSchema(TableName.MembershipRole)
        )
    )
    .into(
      knex.raw("?? (??,??,??,??,??,??,??,??,??,??,??)", [
        TableName.ProjectUserMembershipRole,
        ...projectMembershipRoleFields
      ])
    )
    .onConflict("id")
    .merge(projectMembershipRoleFields);

  await knex
    .insert(
      knex(TableName.MembershipRole)
        .join(TableName.Membership, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .select(
          knex.ref("id").withSchema(TableName.MembershipRole),
          "role",
          knex.ref("membershipId").withSchema(TableName.MembershipRole),
          "customRoleId",
          "isTemporary",
          "temporaryMode",
          "temporaryRange",
          "temporaryAccessStartTime",
          "temporaryAccessEndTime",
          knex.ref("createdAt").withSchema(TableName.MembershipRole),
          knex.ref("updatedAt").withSchema(TableName.MembershipRole)
        )
    )
    .into(
      knex.raw("?? (??,??,??,??,??,??,??,??,??,??,??)", [
        TableName.IdentityProjectMembershipRole,
        ...projectMembershipRoleFields
      ])
    )
    .onConflict("id")
    .merge(projectMembershipRoleFields);

  await knex
    .insert(
      knex(TableName.MembershipRole)
        .join(TableName.Membership, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .whereNotNull(`${TableName.Membership}.actorGroupId`)
        .select(
          knex.ref("id").withSchema(TableName.MembershipRole),
          "role",
          knex.ref("membershipId").withSchema(TableName.MembershipRole),
          "customRoleId",
          "isTemporary",
          "temporaryMode",
          "temporaryRange",
          "temporaryAccessStartTime",
          "temporaryAccessEndTime",
          knex.ref("createdAt").withSchema(TableName.MembershipRole),
          knex.ref("updatedAt").withSchema(TableName.MembershipRole)
        )
    )
    .into(
      knex.raw("?? (??,??,??,??,??,??,??,??,??,??,??)", [
        TableName.GroupProjectMembershipRole,
        ...projectMembershipRoleFields
      ])
    )
    .onConflict("id")
    .merge(projectMembershipRoleFields);
};

const rollbackRoleData = async (knex: Knex) => {
  const orgRoleFields = ["id", "name", "description", "slug", "permissions", "createdAt", "updatedAt", "orgId"];

  await knex
    .insert(
      knex(TableName.Role)
        .whereNotNull("orgId")
        .select("id", "name", "description", "slug", "permissions", "createdAt", "updatedAt", "orgId")
    )
    .into(knex.raw("?? (??, ??, ??, ??, ??, ??, ??, ??)", [TableName.OrgRoles, ...orgRoleFields]))
    .onConflict("id")
    .merge(orgRoleFields);

  const projectRoleFields = ["id", "name", "description", "slug", "permissions", "createdAt", "updatedAt", "projectId"];

  await knex
    .insert(
      knex(TableName.Role)
        .whereNotNull("projectId")
        .select("id", "name", "description", "slug", "permissions", "createdAt", "updatedAt", "projectId")
    )
    .into(knex.raw("?? (??, ??, ??, ??, ??, ??, ??, ??)", [TableName.ProjectRoles, ...projectRoleFields]))
    .onConflict("id")
    .merge(projectRoleFields);
};

const rollbackMembershipData = async (knex: Knex) => {
  const orgMembershipFields = [
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
    "role",
    "roleId"
  ];
  await knex
    .insert(
      knex(TableName.Membership)
        .leftJoin(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .select(
          knex.ref("id").withSchema(TableName.Membership),
          "status",
          "inviteEmail",
          knex.ref("createdAt").withSchema(TableName.Membership),
          knex.ref("updatedAt").withSchema(TableName.Membership),
          "actorUserId",
          "scopeOrgId",
          "projectFavorites",
          "isActive",
          "lastInvitedAt",
          "lastLoginAuthMethod",
          "lastLoginTime",
          "role",
          "customRoleId"
        )
    )
    .into(
      knex.raw("?? (??, ??, ??, ??, ??, ??, ??, ??, ??, ??, ??, ??, ??, ??)", [
        TableName.OrgMembership,
        ...orgMembershipFields
      ])
    )
    .onConflict("id")
    .merge(orgMembershipFields);

  const identityOrgMembershipFields = [
    "id",
    "identityId",
    "orgId",
    "lastLoginAuthMethod",
    "lastLoginTime",
    "createdAt",
    "updatedAt",
    "role",
    "roleId"
  ];

  await knex
    .insert(
      knex(TableName.Membership)
        .leftJoin(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .select(
          knex.ref("id").withSchema(TableName.Membership),
          "actorIdentityId",
          "scopeOrgId",
          "lastLoginAuthMethod",
          "lastLoginTime",
          knex.ref("createdAt").withSchema(TableName.Membership),
          knex.ref("updatedAt").withSchema(TableName.Membership),
          "role",
          "customRoleId"
        )
    )
    .into(
      knex.raw("?? (??, ??, ??, ??, ??, ??, ??, ??, ??)", [
        TableName.IdentityOrgMembership,
        ...identityOrgMembershipFields
      ])
    )
    .onConflict("id")
    .merge(identityOrgMembershipFields);

  const projectMembershipFields = ["id", "userId", "projectId", "createdAt", "updatedAt"];

  await knex
    .insert(
      knex(TableName.Membership)
        .where("scope", AccessScope.Project)
        .whereNotNull("actorUserId")
        .select("id", "actorUserId", "scopeProjectId", "createdAt", "updatedAt")
    )
    .into(knex.raw("?? (??, ??, ??, ??, ??)", [TableName.ProjectMembership, ...projectMembershipFields]))
    .onConflict("id")
    .merge(projectMembershipFields);

  const identityProjectMembershipFields = ["id", "identityId", "projectId", "createdAt", "updatedAt"];

  await knex
    .insert(
      knex(TableName.Membership)
        .where("scope", AccessScope.Project)
        .whereNotNull("actorIdentityId")
        .select("id", "actorIdentityId", "scopeProjectId", "createdAt", "updatedAt")
    )
    .into(
      knex.raw("?? (??, ??, ??, ??, ??)", [TableName.IdentityProjectMembership, ...identityProjectMembershipFields])
    )
    .onConflict("id")
    .merge(identityProjectMembershipFields);

  const groupProjectMembershipFields = ["id", "groupId", "projectId", "createdAt", "updatedAt"];

  await knex
    .insert(
      knex(TableName.Membership)
        .where("scope", AccessScope.Project)
        .whereNotNull("actorGroupId")
        .select("id", "actorGroupId", "scopeProjectId", "createdAt", "updatedAt")
    )
    .into(knex.raw("?? (??, ??, ??, ??, ??)", [TableName.GroupProjectMembership, ...groupProjectMembershipFields]))
    .onConflict("id")
    .merge(groupProjectMembershipFields);
};

export async function down(knex: Knex): Promise<void> {
  const hasRoleTable = await knex.schema.hasTable(TableName.Role);
  const hasOrgRoleTable = await knex.schema.hasTable(TableName.OrgRoles);
  const hasProjectRoleTable = await knex.schema.hasTable(TableName.ProjectRoles);
  if (hasRoleTable && hasOrgRoleTable && hasProjectRoleTable) {
    await rollbackRoleData(knex);
  }

  const hasMembershipTable = await knex.schema.hasTable(TableName.Membership);
  const hasOrgMembershipTable = await knex.schema.hasTable(TableName.OrgMembership);
  const hasIdentityOrgMembershipTable = await knex.schema.hasTable(TableName.IdentityOrgMembership);
  const hasProjectMembershipTable = await knex.schema.hasTable(TableName.ProjectMembership);
  const hasIdentityProjectMembershipTable = await knex.schema.hasTable(TableName.IdentityProjectMembership);
  const hasGroupProjectMembershipTable = await knex.schema.hasTable(TableName.GroupProjectMembership);
  if (
    hasMembershipTable &&
    hasOrgMembershipTable &&
    hasIdentityOrgMembershipTable &&
    hasProjectMembershipTable &&
    hasIdentityProjectMembershipTable &&
    hasGroupProjectMembershipTable
  ) {
    await rollbackMembershipData(knex);
  }

  const hasMembershipRoleTable = await knex.schema.hasTable(TableName.MembershipRole);
  const hasProjectUserMembershipRoleTable = await knex.schema.hasTable(TableName.ProjectUserMembershipRole);
  const hasIdentityProjectMembershipRoleTable = await knex.schema.hasTable(TableName.IdentityProjectMembershipRole);
  const hasGroupProjectMembershipRoleTable = await knex.schema.hasTable(TableName.GroupProjectMembershipRole);
  const hasGroupsTable = await knex.schema.hasTable(TableName.Groups);
  if (
    hasMembershipRoleTable &&
    hasProjectUserMembershipRoleTable &&
    hasIdentityProjectMembershipRoleTable &&
    hasGroupProjectMembershipRoleTable &&
    hasGroupsTable
  ) {
    await rollbackMembershipRoleData(knex);
  }

  const hasAdditionalPrivilegeTable = await knex.schema.hasTable(TableName.AdditionalPrivilege);
  const hasProjectUserAdditionalPrivilegeTable = await knex.schema.hasTable(TableName.ProjectUserAdditionalPrivilege);
  const hasIdentityProjectAdditionalPrivilegeTable = await knex.schema.hasTable(
    TableName.IdentityProjectAdditionalPrivilege
  );
  if (
    hasAdditionalPrivilegeTable &&
    hasProjectUserAdditionalPrivilegeTable &&
    hasIdentityProjectAdditionalPrivilegeTable
  ) {
    await rollbackAdditionalPrivilegeData(knex);
  }

  // Restore foreign key references
  const hasApColumnInAccessApprovalRequest = await knex.schema.hasColumn(
    TableName.AccessApprovalRequest,
    "privilegeId"
  );
  if (hasApColumnInAccessApprovalRequest && hasProjectUserAdditionalPrivilegeTable) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.dropForeign("privilegeId");
      t.foreign("privilegeId").references("id").inTable(TableName.ProjectUserAdditionalPrivilege);
    });
  }

  const hasExternalGroupRoleMappingRoleColumn = await knex.schema.hasColumn(
    TableName.ExternalGroupOrgRoleMapping,
    "roleId"
  );
  if (hasExternalGroupRoleMappingRoleColumn && hasOrgRoleTable) {
    await knex.schema.alterTable(TableName.ExternalGroupOrgRoleMapping, (t) => {
      t.dropForeign("roleId");
      t.foreign("roleId").references("id").inTable(TableName.OrgRoles);
    });
  }

  // Drop new tables
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
