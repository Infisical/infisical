import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { unpackRules } from "@casl/ability/extra";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";

import {
  conditionsMatcher,
  fetchUserOrgPermissions,
  roleQueryKeys
} from "@app/hooks/api/roles/queries";

import { OrgPermissionSet } from "./types";
import { useCallback } from "react";

export const useOrgPermission = () => {
  const organizationId = useRouteContext({
    from: "/_authenticate/_inject-org-details",
    select: (el) => el.organizationId
  });

  const {
    data: { permission, memberships = [] }
  } = useSuspenseQuery({
    queryKey: roleQueryKeys.getUserOrgPermissions({ orgId: organizationId }),
    queryFn: () => fetchUserOrgPermissions({ orgId: organizationId }),
    select: (res) => {
      const rule = unpackRules<RawRuleOf<MongoAbility<OrgPermissionSet>>>(res.permissions);
      const ability = createMongoAbility<OrgPermissionSet>(rule, { conditionsMatcher });
      return { permission: ability, memberships: res.memberships };
    },
    staleTime: Infinity
  });

  const hasOrgRole = useCallback(
    (role: string) =>
      memberships?.some((membership) => membership.roles.some((el) => role === el.role)),
    []
  );

  return { permission, memberships, hasOrgRole };
};
