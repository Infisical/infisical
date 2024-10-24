/* eslint-disable no-await-in-loop */
import { packRules, unpackRules } from "@casl/ability/extra";
import { Knex } from "knex";

import {
  backfillPermissionV1SchemaToV2Schema,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";

import { TableName } from "../schemas";

const CHUNK_SIZE = 1000;
export async function up(knex: Knex): Promise<void> {
  const hasVersion = await knex.schema.hasColumn(TableName.ProjectRoles, "version");
  if (!hasVersion) {
    await knex.schema.alterTable(TableName.ProjectRoles, (t) => {
      t.integer("version").defaultTo(1).notNullable();
    });

    const docs = await knex(TableName.ProjectRoles).select("*");
    const updatedDocs = docs
      .filter((i) => {
        const permissionString = JSON.stringify(i.permissions || []);
        return (
          !permissionString.includes(ProjectPermissionSub.SecretImports) &&
          !permissionString.includes(ProjectPermissionSub.DynamicSecrets)
        );
      })
      .map((el) => ({
        ...el,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore-error this is valid ts
        permissions: JSON.stringify(packRules(backfillPermissionV1SchemaToV2Schema(unpackRules(el.permissions), true)))
      }));
    if (updatedDocs.length) {
      for (let i = 0; i < updatedDocs.length; i += CHUNK_SIZE) {
        const chunk = updatedDocs.slice(i, i + CHUNK_SIZE);
        await knex(TableName.ProjectRoles).insert(chunk).onConflict("id").merge();
      }
    }

    // secret permission is split into multiple ones like secrets, folders, imports and dynamic-secrets
    // so we just find all the privileges with respective mapping and map it as needed
    const identityPrivileges = await knex(TableName.IdentityProjectAdditionalPrivilege).select("*");
    const updatedIdentityPrivilegesDocs = identityPrivileges
      .filter((i) => {
        const permissionString = JSON.stringify(i.permissions || []);
        return (
          !permissionString.includes(ProjectPermissionSub.SecretImports) &&
          !permissionString.includes(ProjectPermissionSub.DynamicSecrets) &&
          !permissionString.includes(ProjectPermissionSub.SecretFolders)
        );
      })
      .map((el) => ({
        ...el,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore-error this is valid ts
        permissions: JSON.stringify(packRules(backfillPermissionV1SchemaToV2Schema(unpackRules(el.permissions))))
      }));
    if (updatedIdentityPrivilegesDocs.length) {
      for (let i = 0; i < updatedIdentityPrivilegesDocs.length; i += CHUNK_SIZE) {
        const chunk = updatedIdentityPrivilegesDocs.slice(i, i + CHUNK_SIZE);
        await knex(TableName.IdentityProjectAdditionalPrivilege).insert(chunk).onConflict("id").merge();
      }
    }

    const userPrivileges = await knex(TableName.ProjectUserAdditionalPrivilege).select("*");
    const updatedUserPrivilegeDocs = userPrivileges
      .filter((i) => {
        const permissionString = JSON.stringify(i.permissions || []);
        return (
          !permissionString.includes(ProjectPermissionSub.SecretImports) &&
          !permissionString.includes(ProjectPermissionSub.DynamicSecrets) &&
          !permissionString.includes(ProjectPermissionSub.SecretFolders)
        );
      })
      .map((el) => ({
        ...el,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore-error this is valid ts
        permissions: JSON.stringify(packRules(backfillPermissionV1SchemaToV2Schema(unpackRules(el.permissions))))
      }));
    if (docs.length) {
      for (let i = 0; i < updatedUserPrivilegeDocs.length; i += CHUNK_SIZE) {
        const chunk = updatedUserPrivilegeDocs.slice(i, i + CHUNK_SIZE);
        await knex(TableName.ProjectUserAdditionalPrivilege).insert(chunk).onConflict("id").merge();
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasVersion = await knex.schema.hasColumn(TableName.ProjectRoles, "version");
  if (hasVersion) {
    await knex.schema.alterTable(TableName.ProjectRoles, (t) => {
      t.dropColumn("version");
    });

    // permission change can be ignored
  }
}
