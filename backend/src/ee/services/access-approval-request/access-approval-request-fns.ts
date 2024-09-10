import { PackRule, unpackRules } from "@casl/ability/extra";

import { UnauthorizedError } from "@app/lib/errors";

import { TVerifyPermission } from "./access-approval-request-types";

function filterUnique(value: string, index: number, array: string[]) {
  return array.indexOf(value) === index;
}

export const verifyRequestedPermissions = ({ permissions }: TVerifyPermission) => {
  const permission = unpackRules(
    permissions as PackRule<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conditions?: Record<string, any>;
      action: string;
      subject: [string];
    }>[]
  );

  if (!permission || !permission.length) {
    throw new UnauthorizedError({ message: "No permission provided" });
  }

  const requestedPermissions: string[] = [];

  for (const p of permission) {
    if (p.action[0] === "read") requestedPermissions.push("Read Access");
    if (p.action[0] === "create") requestedPermissions.push("Create Access");
    if (p.action[0] === "delete") requestedPermissions.push("Delete Access");
    if (p.action[0] === "edit") requestedPermissions.push("Edit Access");
  }

  const firstPermission = permission[0];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const permissionSecretPath = firstPermission.conditions?.secretPath?.$glob;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-assignment
  const permissionEnv = firstPermission.conditions?.environment;

  if (!permissionEnv || typeof permissionEnv !== "string") {
    throw new UnauthorizedError({ message: "Permission environment is not a string" });
  }
  if (!permissionSecretPath || typeof permissionSecretPath !== "string") {
    throw new UnauthorizedError({ message: "Permission path is not a string" });
  }

  return {
    envSlug: permissionEnv,
    secretPath: permissionSecretPath,
    accessTypes: requestedPermissions.filter(filterUnique)
  };
};
