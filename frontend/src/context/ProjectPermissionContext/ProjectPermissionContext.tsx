import { useCallback } from "react";
import { MongoAbility, RawRuleOf } from "@casl/ability";
import { unpackRules } from "@casl/ability/extra";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { evaluatePermissionsAbility } from "@app/helpers/permissions";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";

import { useOrganization } from "../OrganizationContext";
import { ProjectPermissionSet } from "./types";

export const useProjectPermission = () => {
  const params = useParams({
    strict: false
  });

  const { currentOrg } = useOrganization();

  const projectId = params.projectId ?? currentOrg.pamProjectId;

  if (!projectId) {
    throw new Error("useProjectPermission to be used within <ProjectPermissionContext>");
  }

  const {
    data: { permission, memberships, assumedPrivilegeDetails }
  } = useSuspenseQuery({
    queryKey: roleQueryKeys.getUserProjectPermissions({ projectId }),
    queryFn: () => fetchUserProjectPermissions({ projectId }),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    select: (data) => {
      const rule = unpackRules<RawRuleOf<MongoAbility<ProjectPermissionSet>>>(data.permissions);
      const ability = evaluatePermissionsAbility(rule);
      return {
        permission: ability,
        assumedPrivilegeDetails: data.assumedPrivilegeDetails,
        memberships: data.memberships
      };
    }
  });

  const hasProjectRole = useCallback(
    (role: string) =>
      memberships?.some((membership) => membership.roles.some((el) => role === el.role)),
    []
  );

  return { permission, memberships, hasProjectRole, assumedPrivilegeDetails };
};
