import { MongoAbility, RawRuleOf } from "@casl/ability";

import {
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "./project-permission";

// A forbid written before an action was split in two also forbids the two new actions, so an old custom role keeps
// denying what it denied.
const LEGACY_FORBID_ACTION_EXPANSIONS: Partial<
  Record<ProjectPermissionSub, { legacyAction: string; newActions: string[] }>
> = {
  [ProjectPermissionSub.Secrets]: {
    legacyAction: ProjectPermissionSecretActions.DescribeAndReadValue,
    newActions: [ProjectPermissionSecretActions.ReadValue, ProjectPermissionSecretActions.DescribeSecret]
  },
  [ProjectPermissionSub.Member]: {
    legacyAction: ProjectPermissionMemberActions.GrantPrivileges,
    newActions: [ProjectPermissionMemberActions.AssignRole, ProjectPermissionMemberActions.AssignAdditionalPrivileges]
  },
  [ProjectPermissionSub.Identity]: {
    legacyAction: ProjectPermissionIdentityActions.GrantPrivileges,
    newActions: [
      ProjectPermissionIdentityActions.AssignRole,
      ProjectPermissionIdentityActions.AssignAdditionalPrivileges
    ]
  },
  [ProjectPermissionSub.Groups]: {
    legacyAction: ProjectPermissionGroupActions.GrantPrivileges,
    newActions: [ProjectPermissionGroupActions.AssignRole]
  }
};

export const expandLegacyForbidActions = <T extends RawRuleOf<MongoAbility<ProjectPermissionSet>>>(rules: T[]): T[] => {
  return rules.map((rule) => {
    if (!rule.inverted) return rule;

    const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    if (subjects.length !== 1) return rule;

    const expansion = LEGACY_FORBID_ACTION_EXPANSIONS[subjects[0] as ProjectPermissionSub];
    if (!expansion) return rule;

    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    const shouldExpand = actions.some((a) => expansion.newActions.includes(a as string));
    if (!shouldExpand || actions.includes(expansion.legacyAction as (typeof actions)[number])) return rule;

    return { ...rule, action: [...actions, expansion.legacyAction] as typeof rule.action };
  });
};
