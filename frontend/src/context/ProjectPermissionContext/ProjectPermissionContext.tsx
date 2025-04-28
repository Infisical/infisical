import { useCallback } from "react";
import { MongoAbility, RawRuleOf } from "@casl/ability";
import { unpackRules } from "@casl/ability/extra";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { evaluatePermissionsAbility } from "@app/helpers/permissions";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";

import { ProjectPermissionSet } from "./types";

export const useProjectPermission = () => {
  const projectId = useParams({
    strict: false,
    select: (el) => el?.projectId
  });

  if (!projectId) {
    throw new Error("useProjectPermission to be used within <ProjectPermissionContext>");
  }

  const {
    data: { permission, membership, assumedPrivilegeDetails }
  } = useSuspenseQuery({
    queryKey: roleQueryKeys.getUserProjectPermissions({ workspaceId: projectId }),
    queryFn: () => fetchUserProjectPermissions({ workspaceId: projectId }),
    staleTime: Infinity,
    select: (data) => {
      const rule = unpackRules<RawRuleOf<MongoAbility<ProjectPermissionSet>>>(data.permissions);
      const ability = evaluatePermissionsAbility(rule);
      return {
        permission: ability,
        assumedPrivilegeDetails: data.assumedPrivilegeDetails,
        membership: {
          ...data.membership,
          roles: data.membership.roles.map(({ role }) => role)
        }
      };
    }
  });

  const hasProjectRole = useCallback(
    (role: string) => membership?.roles?.includes(role) || false,
    []
  );

  return { permission, membership, hasProjectRole, assumedPrivilegeDetails };
};
