import { MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, packRules, unpackRules } from "@casl/ability/extra";
import { Knex } from "knex";
import { z } from "zod";

import { selectAllTableCols } from "@app/lib/knex";

import { TableName } from "../schemas";

enum ProjectPermissionSub {
  Secrets = "secrets"
}

enum SecretActions {
  Read = "read",
  ReadValue = "readValue"
}

export const UnpackedPermissionSchema = z.object({
  subject: z
    .union([z.string().min(1), z.string().array()])
    .transform((el) => (typeof el !== "string" ? el[0] : el))
    .optional(),
  action: z.union([z.string().min(1), z.string().array()]).transform((el) => (typeof el === "string" ? [el] : el)),
  conditions: z.unknown().optional(),
  inverted: z.boolean().optional()
});

export const unpackPermissions = (permissions: unknown) =>
  UnpackedPermissionSchema.array().parse(unpackRules((permissions || []) as PackRule<RawRuleOf<MongoAbility>>[]));

export async function up(knex: Knex): Promise<void> {
  const projectRoles = await knex(TableName.ProjectRoles).select(selectAllTableCols(TableName.ProjectRoles));
  const projectIdentityAdditionalPrivileges = await knex(TableName.IdentityProjectAdditionalPrivilege).select(
    selectAllTableCols(TableName.IdentityProjectAdditionalPrivilege)
  );
  const projectUserAdditionalPrivileges = await knex(TableName.ProjectUserAdditionalPrivilege).select(
    selectAllTableCols(TableName.ProjectUserAdditionalPrivilege)
  );

  for await (const projectRole of projectRoles) {
    const { permissions } = projectRole;

    const parsedPermissions = unpackPermissions(permissions);
    let shouldUpdate = false;

    for (let i = 0; i < parsedPermissions.length; i += 1) {
      const parsedPermission = parsedPermissions[i];
      const { subject, action } = parsedPermission;

      if (subject === ProjectPermissionSub.Secrets) {
        if (action.includes(SecretActions.Read) && !action.includes(SecretActions.ReadValue)) {
          action.push(SecretActions.ReadValue);
          parsedPermissions[i] = { ...parsedPermission, action };
          shouldUpdate = true;
        }
      }
    }

    if (shouldUpdate) {
      const repackedPermissions = packRules(parsedPermissions);

      await knex(TableName.ProjectRoles)
        .where("id", projectRole.id)
        .update({ permissions: JSON.stringify(repackedPermissions) });
    }
  }

  for await (const identityAdditionalPrivilege of projectIdentityAdditionalPrivileges) {
    const { permissions } = identityAdditionalPrivilege;

    const parsedPermissions = unpackPermissions(permissions);
    let shouldUpdate = false;

    for (let i = 0; i < parsedPermissions.length; i += 1) {
      const parsedPermission = parsedPermissions[i];
      const { subject, action } = parsedPermission;

      if (subject === ProjectPermissionSub.Secrets) {
        if (action.includes(SecretActions.Read) && !action.includes(SecretActions.ReadValue)) {
          action.push(SecretActions.ReadValue);
          parsedPermissions[i] = { ...parsedPermission, action };
          shouldUpdate = true;
        }
      }
    }

    if (shouldUpdate) {
      const repackedPermissions = packRules(parsedPermissions);

      await knex(TableName.IdentityProjectAdditionalPrivilege)
        .where("id", identityAdditionalPrivilege.id)
        .update({ permissions: JSON.stringify(repackedPermissions) });
    }
  }

  for await (const userAdditionalPrivilege of projectUserAdditionalPrivileges) {
    const { permissions } = userAdditionalPrivilege;

    const parsedPermissions = unpackPermissions(permissions);
    let shouldUpdate = false;

    for (let i = 0; i < parsedPermissions.length; i += 1) {
      const parsedPermission = parsedPermissions[i];
      const { subject, action } = parsedPermission;

      if (subject === ProjectPermissionSub.Secrets) {
        if (action.includes(SecretActions.Read) && !action.includes(SecretActions.ReadValue)) {
          action.push(SecretActions.ReadValue);
          parsedPermissions[i] = { ...parsedPermission, action };
          shouldUpdate = true;
        }
      }
    }

    if (shouldUpdate) {
      const repackedPermissions = packRules(parsedPermissions);

      await knex(TableName.ProjectUserAdditionalPrivilege)
        .where("id", userAdditionalPrivilege.id)
        .update({ permissions: JSON.stringify(repackedPermissions) });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const projectRoles = await knex(TableName.ProjectRoles).select(selectAllTableCols(TableName.ProjectRoles));
  const identityAdditionalPrivileges = await knex(TableName.IdentityProjectAdditionalPrivilege).select(
    selectAllTableCols(TableName.IdentityProjectAdditionalPrivilege)
  );
  const userAdditionalPrivileges = await knex(TableName.ProjectUserAdditionalPrivilege).select(
    selectAllTableCols(TableName.ProjectUserAdditionalPrivilege)
  );

  for await (const projectRole of projectRoles) {
    const { permissions } = projectRole;

    const parsedPermissions = unpackPermissions(permissions);

    for (let i = 0; i < parsedPermissions.length; i += 1) {
      const parsedPermission = parsedPermissions[i];

      const { subject, action } = parsedPermission;

      if (subject === ProjectPermissionSub.Secrets) {
        if (action.includes(SecretActions.ReadValue)) {
          action.splice(action.indexOf(SecretActions.ReadValue));
          parsedPermissions[i] = { ...parsedPermission, action };
        }
      }
    }

    const repackedPermissions = packRules(parsedPermissions);

    await knex(TableName.ProjectRoles)
      .where("id", projectRole.id)
      .update({ permissions: JSON.stringify(repackedPermissions) });
  }

  for await (const identityAdditionalPrivilege of identityAdditionalPrivileges) {
    const { permissions } = identityAdditionalPrivilege;

    const parsedPermissions = unpackPermissions(permissions);

    for (let i = 0; i < parsedPermissions.length; i += 1) {
      const parsedPermission = parsedPermissions[i];

      const { subject, action } = parsedPermission;

      if (subject === ProjectPermissionSub.Secrets) {
        if (action.includes(SecretActions.ReadValue)) {
          action.splice(action.indexOf(SecretActions.ReadValue));
          parsedPermissions[i] = { ...parsedPermission, action };
        }
      }
    }

    const repackedPermissions = packRules(parsedPermissions);

    await knex(TableName.IdentityProjectAdditionalPrivilege)
      .where("id", identityAdditionalPrivilege.id)
      .update({ permissions: JSON.stringify(repackedPermissions) });
  }

  for await (const userAdditionalPrivilege of userAdditionalPrivileges) {
    const { permissions } = userAdditionalPrivilege;

    const parsedPermissions = unpackPermissions(permissions);

    for (let i = 0; i < parsedPermissions.length; i += 1) {
      const parsedPermission = parsedPermissions[i];

      const { subject, action } = parsedPermission;

      if (subject === ProjectPermissionSub.Secrets) {
        if (action.includes(SecretActions.ReadValue)) {
          action.splice(action.indexOf(SecretActions.ReadValue));
          parsedPermissions[i] = { ...parsedPermission, action };
        }
      }
    }

    const repackedPermissions = packRules(parsedPermissions);

    await knex(TableName.ProjectUserAdditionalPrivilege)
      .where("id", userAdditionalPrivilege.id)
      .update({ permissions: JSON.stringify(repackedPermissions) });
  }
}
