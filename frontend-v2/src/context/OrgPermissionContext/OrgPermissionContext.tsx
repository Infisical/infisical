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

export const useOrgPermission = () => {
  const organizationId = useRouteContext({
    from: "/_authenticate/_inject-org-details",
    select: (el) => el.organizationId
  });

  const { data } = useSuspenseQuery({
    queryKey: roleQueryKeys.getUserOrgPermissions({ orgId: organizationId }),
    queryFn: () => fetchUserOrgPermissions({ orgId: organizationId }),
    select: (res) => {
      const rule = unpackRules<RawRuleOf<MongoAbility<OrgPermissionSet>>>(res.permissions);
      const ability = createMongoAbility<OrgPermissionSet>(rule, { conditionsMatcher });
      return { permission: ability, membership: res.membership };
    },
    staleTime: Infinity
  });

  return data;
};
