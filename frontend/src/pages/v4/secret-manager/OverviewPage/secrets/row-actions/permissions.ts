import { subject } from "@casl/ability";

import type { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";

import { useProjectPermission } from "../../../../access/permissions";

export type PermissionScope = { environment: string; secretPath: string } & Record<string, unknown>;

export const useManagedBlock = (projectId: string) => {
  const { permission, isPending } = useProjectPermission(projectId);
  return (sub: ProjectPermissionSub, action: string, scope: PermissionScope, verb: string) =>
    isPending || permission.can(action as never, subject(sub, scope) as never)
      ? undefined
      : `You don't have permission to ${verb}`;
};

export const useCreateBlock = (
  projectId: string,
  sub: ProjectPermissionSub,
  action: string,
  environments: readonly string[],
  secretPath: string,
  verb: string
) => {
  const blockFor = useManagedBlock(projectId);
  const blocks = environments.map((environment) =>
    blockFor(sub, action, { environment, secretPath }, verb)
  );
  return blocks.length > 0 && blocks.every(Boolean) ? blocks[0] : undefined;
};
