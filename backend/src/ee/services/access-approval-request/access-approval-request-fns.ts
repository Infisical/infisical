import { PackRule, unpackRules } from "@casl/ability/extra";

import { BadRequestError } from "@app/lib/errors";

import { TVerifyPermission } from "./access-approval-request-types";

export const verifyRequestedPermissions = ({ permissions, checkPath }: TVerifyPermission) => {
  const permission = unpackRules(
    permissions as PackRule<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conditions?: Record<string, any>;
      action: string;
      subject: [string];
    }>[]
  );

  if (!permission || !permission.length) {
    throw new BadRequestError({ message: "No permission provided" });
  }

  for (const perm of permission) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-assignment
    const permissionEnv = perm.conditions?.environment;

    if (!permissionEnv || typeof permissionEnv !== "string") {
      throw new BadRequestError({ message: "Permission environment is not a string" });
    }

    if (checkPath) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const permissionSecretPath = perm.conditions?.secretPath?.$glob;
      if (!permissionSecretPath || typeof permissionSecretPath !== "string") {
        throw new BadRequestError({ message: "Permission path is not a string" });
      }
    }
  }
};
