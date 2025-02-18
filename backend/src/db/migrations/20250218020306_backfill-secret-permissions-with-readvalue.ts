import { selectAllTableCols } from "@app/lib/knex";
import { Knex } from "knex";
import { TableName } from "../schemas";

// [["read,create","secrets",{"environment":{"$eq":"dev"}}],
//  ["read,edit,create","secrets",{"environment":{"$eq":"staging"}}],
//  ["read,create","secrets",{"environment":{"$eq":"prod"}},1],
//  ["edit,delete,create","secret-folders",{}],
//  ["read,edit,delete,create","secret-imports",{}],
//  ["read,edit,delete,create","member"],
//  ["read,edit,delete,create","role"],
//  ["read,edit,delete,create","integrations"],
//  ["read,edit","settings"],
//  ["edit,delete","workspace"],
//  ["read,edit,delete,create","tags"],
//  ["read,create,edit,delete,sync-secrets,import-secrets,remove-secrets","secret-syncs"]]

// enum ProjectPermissionSub {
//   Secrets = "secrets"
// }

export async function up(knex: Knex): Promise<void> {
  const projectRoles = await knex(TableName.ProjectRoles).select(selectAllTableCols(TableName.ProjectRoles));

  for (const projectRole of projectRoles) {
    const { _, permissions } = projectRole;

    const parsedPermissions = JSON.parse(permissions as string) as Record<string, string>[]; // contains array of permissions.

    for (const parsedPermission of parsedPermissions) {
      console.log(parsedPermission);
    }
  }
}

export async function down(knex: Knex): Promise<void> {}
