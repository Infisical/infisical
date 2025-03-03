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

const UnpackedPermissionSchema = z.object({
  subject: z
    .union([z.string().min(1), z.string().array()])
    .transform((el) => (typeof el !== "string" ? el[0] : el))
    .optional(),
  action: z.union([z.string().min(1), z.string().array()]).transform((el) => (typeof el === "string" ? [el] : el)),
  conditions: z.unknown().optional(),
  inverted: z.boolean().optional()
});

const $unpackPermissions = (permissions: unknown) =>
  UnpackedPermissionSchema.array().parse(unpackRules((permissions || []) as PackRule<RawRuleOf<MongoAbility>>[]));

const $updatePermissionsUp = (permissions: unknown) => {
  const parsedPermissions = $unpackPermissions(permissions);
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

  return {
    parsedPermissions,
    shouldUpdate
  };
};

const $updatePermissionsDown = (permissions: unknown) => {
  const parsedPermissions = $unpackPermissions(permissions);

  let shouldUpdate = false;
  for (let i = 0; i < parsedPermissions.length; i += 1) {
    const parsedPermission = parsedPermissions[i];

    const { subject, action } = parsedPermission;

    if (subject === ProjectPermissionSub.Secrets) {
      const readValueIndex = action.indexOf(SecretActions.ReadValue);

      if (action.includes(SecretActions.ReadValue) && readValueIndex !== -1) {
        action.splice(readValueIndex, 1);
        parsedPermissions[i] = { ...parsedPermission, action };

        shouldUpdate = true;
      }
    }
  }

  const repackedPermissions = packRules(parsedPermissions);

  return {
    repackedPermissions,
    shouldUpdate
  };
};

const CHUNK_SIZE = 1000;

export async function up(knex: Knex): Promise<void> {
  const projectRoles = await knex(TableName.ProjectRoles).select(selectAllTableCols(TableName.ProjectRoles));
  const projectIdentityAdditionalPrivileges = await knex(TableName.IdentityProjectAdditionalPrivilege).select(
    selectAllTableCols(TableName.IdentityProjectAdditionalPrivilege)
  );
  const projectUserAdditionalPrivileges = await knex(TableName.ProjectUserAdditionalPrivilege).select(
    selectAllTableCols(TableName.ProjectUserAdditionalPrivilege)
  );

  const serviceTokens = await knex(TableName.ServiceToken).select(selectAllTableCols(TableName.ServiceToken));

  const updatedServiceTokens = serviceTokens.reduce<typeof serviceTokens>((acc, serviceToken) => {
    const { permissions } = serviceToken; // Service tokens are special, and include an array of actions only.

    if (permissions.includes(SecretActions.Read) && !permissions.includes(SecretActions.ReadValue)) {
      permissions.push(SecretActions.ReadValue);
      acc.push({
        ...serviceToken,
        permissions
      });
    }
    return acc;
  }, []);

  if (updatedServiceTokens.length > 0) {
    for (let i = 0; i < updatedServiceTokens.length; i += CHUNK_SIZE) {
      const chunk = updatedServiceTokens.slice(i, i + CHUNK_SIZE);

      // eslint-disable-next-line no-await-in-loop
      await knex(TableName.ServiceToken)
        .whereIn(
          "id",
          chunk.map((t) => t.id)
        )
        .update({
          // @ts-expect-error -- raw query
          permissions: knex.raw(
            `CASE id 
          ${chunk.map((t) => `WHEN '${t.id}' THEN ?::text[]`).join(" ")}
          END`,
            chunk.map((t) => t.permissions)
          )
        });
    }
  }

  const updatedRoles = projectRoles.reduce<typeof projectRoles>((acc, projectRole) => {
    const { shouldUpdate, parsedPermissions } = $updatePermissionsUp(projectRole.permissions);

    if (shouldUpdate) {
      acc.push({
        ...projectRole,
        permissions: JSON.stringify(packRules(parsedPermissions))
      });
    }
    return acc;
  }, []);

  const updatedIdentityAdditionalPrivileges = projectIdentityAdditionalPrivileges.reduce<
    typeof projectIdentityAdditionalPrivileges
  >((acc, identityAdditionalPrivilege) => {
    const { shouldUpdate, parsedPermissions } = $updatePermissionsUp(identityAdditionalPrivilege.permissions);

    if (shouldUpdate) {
      acc.push({
        ...identityAdditionalPrivilege,
        permissions: JSON.stringify(packRules(parsedPermissions))
      });
    }
    return acc;
  }, []);

  const updatedUserAdditionalPrivileges = projectUserAdditionalPrivileges.reduce<
    typeof projectUserAdditionalPrivileges
  >((acc, userAdditionalPrivilege) => {
    const { shouldUpdate, parsedPermissions } = $updatePermissionsUp(userAdditionalPrivilege.permissions);

    if (shouldUpdate) {
      acc.push({
        ...userAdditionalPrivilege,
        permissions: JSON.stringify(packRules(parsedPermissions))
      });
    }
    return acc;
  }, []);

  if (updatedRoles.length > 0) {
    for (let i = 0; i < updatedRoles.length; i += CHUNK_SIZE) {
      const chunk = updatedRoles.slice(i, i + CHUNK_SIZE);

      // eslint-disable-next-line no-await-in-loop
      await knex(TableName.ProjectRoles).insert(chunk).onConflict("id").merge(["permissions"]);
    }
  }

  if (updatedIdentityAdditionalPrivileges.length > 0) {
    for (let i = 0; i < updatedIdentityAdditionalPrivileges.length; i += CHUNK_SIZE) {
      const chunk = updatedIdentityAdditionalPrivileges.slice(i, i + CHUNK_SIZE);

      // eslint-disable-next-line no-await-in-loop
      await knex(TableName.IdentityProjectAdditionalPrivilege).insert(chunk).onConflict("id").merge(["permissions"]);
    }
  }

  if (updatedUserAdditionalPrivileges.length > 0) {
    for (let i = 0; i < updatedUserAdditionalPrivileges.length; i += CHUNK_SIZE) {
      const chunk = updatedUserAdditionalPrivileges.slice(i, i + CHUNK_SIZE);

      // eslint-disable-next-line no-await-in-loop
      await knex(TableName.ProjectUserAdditionalPrivilege).insert(chunk).onConflict("id").merge(["permissions"]);
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
  const serviceTokens = await knex(TableName.ServiceToken).select(selectAllTableCols(TableName.ServiceToken));

  const updatedServiceTokens = serviceTokens.reduce<typeof serviceTokens>((acc, serviceToken) => {
    const { permissions } = serviceToken;

    if (permissions.includes(SecretActions.ReadValue)) {
      permissions.splice(permissions.indexOf(SecretActions.ReadValue), 1);
      acc.push({
        ...serviceToken,
        permissions
      });
    }
    return acc;
  }, []);

  if (updatedServiceTokens.length > 0) {
    await knex(TableName.ServiceToken)
      .whereIn(
        "id",
        updatedServiceTokens.map((t) => t.id)
      )
      .update({
        // @ts-expect-error -- raw query
        permissions: knex.raw(
          `CASE id 
          ${updatedServiceTokens.map((t) => `WHEN '${t.id}' THEN ?::text[]`).join(" ")}
        END`,
          updatedServiceTokens.map((t) => t.permissions)
        )
      });
  }

  const updatedRoles = projectRoles.reduce<typeof projectRoles>((acc, projectRole) => {
    const { shouldUpdate, repackedPermissions } = $updatePermissionsDown(projectRole.permissions);

    if (shouldUpdate) {
      acc.push({
        ...projectRole,
        permissions: JSON.stringify(repackedPermissions)
      });
    }
    return acc;
  }, []);

  const updatedIdentityAdditionalPrivileges = identityAdditionalPrivileges.reduce<typeof identityAdditionalPrivileges>(
    (acc, identityAdditionalPrivilege) => {
      const { shouldUpdate, repackedPermissions } = $updatePermissionsDown(identityAdditionalPrivilege.permissions);

      if (shouldUpdate) {
        acc.push({
          ...identityAdditionalPrivilege,
          permissions: JSON.stringify(repackedPermissions)
        });
      }
      return acc;
    },
    []
  );

  const updatedUserAdditionalPrivileges = userAdditionalPrivileges.reduce<typeof userAdditionalPrivileges>(
    (acc, userAdditionalPrivilege) => {
      const { shouldUpdate, repackedPermissions } = $updatePermissionsDown(userAdditionalPrivilege.permissions);

      if (shouldUpdate) {
        acc.push({
          ...userAdditionalPrivilege,
          permissions: JSON.stringify(repackedPermissions)
        });
      }
      return acc;
    },
    []
  );

  if (updatedRoles.length > 0) {
    for (let i = 0; i < updatedRoles.length; i += CHUNK_SIZE) {
      const chunk = updatedRoles.slice(i, i + CHUNK_SIZE);

      // eslint-disable-next-line no-await-in-loop
      await knex(TableName.ProjectRoles).insert(chunk).onConflict("id").merge(["permissions"]);
    }
  }

  if (updatedIdentityAdditionalPrivileges.length > 0) {
    for (let i = 0; i < updatedIdentityAdditionalPrivileges.length; i += CHUNK_SIZE) {
      const chunk = updatedIdentityAdditionalPrivileges.slice(i, i + CHUNK_SIZE);

      // eslint-disable-next-line no-await-in-loop
      await knex(TableName.IdentityProjectAdditionalPrivilege).insert(chunk).onConflict("id").merge(["permissions"]);
    }
  }

  if (updatedUserAdditionalPrivileges.length > 0) {
    for (let i = 0; i < updatedUserAdditionalPrivileges.length; i += CHUNK_SIZE) {
      const chunk = updatedUserAdditionalPrivileges.slice(i, i + CHUNK_SIZE);

      // eslint-disable-next-line no-await-in-loop
      await knex(TableName.ProjectUserAdditionalPrivilege).insert(chunk).onConflict("id").merge(["permissions"]);
    }
  }
}
