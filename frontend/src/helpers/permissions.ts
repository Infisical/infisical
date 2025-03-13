import { createMongoAbility, MongoAbility, MongoQuery, RawRuleOf } from "@casl/ability";

import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext";
import { conditionsMatcher } from "@app/hooks/api/roles/queries";
import { groupBy } from "@app/lib/fn/array";
import { omit } from "@app/lib/fn/object";

export const evaluatePermissionsAbility = (
  rule: RawRuleOf<MongoAbility<ProjectPermissionSet, MongoQuery>>[]
) => {
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

  return ability;
};
