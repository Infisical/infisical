import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { unpackRules } from "@casl/ability/extra";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { namespaceRolesQueryKeys } from "@app/hooks/api/namespaceRoles/queries";
import { conditionsMatcher } from "@app/hooks/api/roles/queries";

import { NamespacePermissionSet } from "./types";

export const useNamespacePermission = () => {
  const namespaceId = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organization/namespaces/$namespaceId/_namespace-layout",
    select: (el) => el.namespaceId
  });

  const { data } = useSuspenseQuery({
    ...namespaceRolesQueryKeys.getUserPermissions({ namespaceId }),
    select: (res) => {
      const rule = unpackRules<RawRuleOf<MongoAbility<NamespacePermissionSet>>>(res.permissions);
      const ability = createMongoAbility<NamespacePermissionSet>(rule, { conditionsMatcher });
      return { permission: ability, memberships: res.memberships };
    },
    staleTime: Infinity
  });

  return data;
};
