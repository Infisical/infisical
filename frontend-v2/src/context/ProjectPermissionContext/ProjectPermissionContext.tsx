import { useCallback } from "react";
import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { unpackRules } from "@casl/ability/extra";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import {
  conditionsMatcher,
  fetchUserProjectPermissions,
  roleQueryKeys
} from "@app/hooks/api/roles/queries";
import { groupBy } from "@app/lib/fn/array";
import { omit } from "@app/lib/fn/object";

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
    data: { permission, membership }
  } = useSuspenseQuery({
    queryKey: roleQueryKeys.getUserProjectPermissions({ workspaceId: projectId }),
    queryFn: () => fetchUserProjectPermissions({ workspaceId: projectId }),
    staleTime: Infinity,
    select: (data) => {
      const rule = unpackRules<RawRuleOf<MongoAbility<ProjectPermissionSet>>>(data.permissions);
      const negatedRules = groupBy(
        rule.filter((i) => i.inverted && i.conditions),
        (i) => `${i.subject}-${JSON.stringify(i.conditions)}`
      );
      const ability = createMongoAbility<ProjectPermissionSet>(rule, {
        // this allows in frontend to skip some rules using *
        conditionsMatcher: (rules) => {
          return (entity) => {
            // skip validation if its negated rules
            const isNegatedRule =
              // eslint-disable-next-line no-underscore-dangle
              negatedRules?.[`${entity.__caslSubjectType__}-${JSON.stringify(rules)}`];
            if (isNegatedRule) {
              const baseMatcher = conditionsMatcher(rules);
              return baseMatcher(entity);
            }

            const rulesStrippedOfWildcard = omit(
              rules,
              Object.keys(entity).filter((el) => entity[el]?.includes("*"))
            );
            const baseMatcher = conditionsMatcher(rulesStrippedOfWildcard);
            return baseMatcher(entity);
          };
        }
      });

      return {
        permission: ability,
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

  return { permission, membership, hasProjectRole };
};
