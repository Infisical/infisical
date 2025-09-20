import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { unpackRules } from "@casl/ability/extra";
import { useSuspenseQuery } from "@tanstack/react-query";

import { conditionsMatcher } from "@app/hooks/api/roles/queries";
import { namespaceRolesQueryKeys } from "@app/hooks/api/namespaceRoles/queries";

import { NamespacePermissionSet } from "./types";
import { useParams } from "@tanstack/react-router";

export const useNamespacePermission = () => {
  const namespaceName = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organization/namespaces/$namespaceName/_namespace-layout",
    select: (el) => el.namespaceName
  });

  const { data } = useSuspenseQuery({
    ...namespaceRolesQueryKeys.getUserPermissions({ namespaceName }),
    select: (res) => {
      const rule = unpackRules<RawRuleOf<MongoAbility<NamespacePermissionSet>>>(res.permissions);
      const ability = createMongoAbility<NamespacePermissionSet>(rule, { conditionsMatcher });
      return { permission: ability, membership: res.membership };
    },
    staleTime: Infinity
  });

  return data;
};
