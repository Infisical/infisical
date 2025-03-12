import { MongoAbility, MongoQuery } from "@casl/ability";

import { ProjectPermissionSet, ProjectPermissionSub } from "@app/context/ProjectPermissionContext";

export type TActionRuleMap = ReturnType<typeof getSubjectActionRuleMap>;

export const getSubjectActionRuleMap = (
  subject: ProjectPermissionSub,
  permissions: MongoAbility<ProjectPermissionSet, MongoQuery>
) => {
  const rules = permissions.rules.filter((rule) => {
    const ruleSubject = typeof rule.subject === "string" ? rule.subject : rule.subject[0];

    return ruleSubject === subject;
  });

  const actionRuleMap: Record<string, (typeof rules)[number]>[] = [];
  rules.forEach((rule) => {
    if (typeof rule.action === "string") {
      actionRuleMap.push({ [rule.action]: rule });
    } else {
      actionRuleMap.push(Object.fromEntries(rule.action.map((action) => [action, rule])));
    }
  });

  return actionRuleMap;
};
