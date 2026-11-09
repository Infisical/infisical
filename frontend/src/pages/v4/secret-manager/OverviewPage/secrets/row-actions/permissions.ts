import { useCallback } from "react";
import { subject } from "@casl/ability";

import type { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";

import { useProjectPermission } from "../../../../access/permissions";
import { useV4Adapter } from "../../../../data/adapters";
import { useV4Session } from "../../../../data/session/contract";

export type PermissionScope = { environment: string; secretPath: string } & Record<string, unknown>;

export const useManagedBlock = (projectId: string) => {
  const { permission, isPending } = useProjectPermission(projectId);
  return useCallback(
    (sub: ProjectPermissionSub, action: string, scope: PermissionScope, verb: string) =>
      isPending || permission.can(action as never, subject(sub, scope) as never)
        ? undefined
        : `You don't have permission to ${verb}`,
    [permission, isPending]
  );
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

export const useFolderAccessPlanBlock = () => {
  const { organization } = useV4Session();
  const hasPlan = useV4Adapter("secrets").useHasFolderAccessPlan(organization.id).data;
  return hasPlan === false
    ? "Folder access controls aren't on your plan. Upgrade to grant access to specific folders."
    : undefined;
};
