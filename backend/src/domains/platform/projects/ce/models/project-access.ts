import { MongoAbility, RawRuleOf } from "@casl/ability";

import { ProjectMembershipRole } from "@app/db/schemas";
import { ActorGrants, Grant, RuleIdentity, RuleSet } from "@app/domains/platform/access-control/ce/module";
import type { TPrincipal } from "@app/lib/auth/principal";

import {
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "./permissions/project-permission-set";
import { Project } from "./project";
import { ProjectPermission } from "./project-permission";
import { TProjectRoles, TProjectRule } from "./standard-project-roles";

// An old forbid on a since-split action also forbids the new actions, so old custom roles keep denying the same.
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

const expandLegacyForbid = <T extends RawRuleOf<MongoAbility<ProjectPermissionSet>>>(rule: T): T => {
  if (!rule.inverted) return rule;
  const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
  if (subjects.length !== 1) return rule;
  const expansion = LEGACY_FORBID_ACTION_EXPANSIONS[subjects[0] as ProjectPermissionSub];
  if (!expansion) return rule;
  const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
  const shouldExpand = actions.some((action) => expansion.newActions.includes(action as string));
  if (!shouldExpand || actions.includes(expansion.legacyAction as (typeof actions)[number])) return rule;
  return { ...rule, action: [...actions, expansion.legacyAction] as typeof rule.action };
};

// What an actor holds in one project and what those roles mean in its product. Products build permissions on it.
export class ProjectAccess {
  private constructor(
    readonly project: Project,
    readonly grants: ActorGrants,
    private readonly roles: TProjectRoles,
    private readonly principal: TPrincipal,
    private readonly identity: RuleIdentity,
    private readonly usesNewPrivilegeSystem: boolean
  ) {}

  static create({
    project,
    grants,
    roles,
    principal,
    identity,
    usesNewPrivilegeSystem
  }: {
    project: Project;
    grants: ActorGrants;
    roles: TProjectRoles;
    principal: TPrincipal;
    identity: RuleIdentity;
    usesNewPrivilegeSystem: boolean;
  }): ProjectAccess {
    return new ProjectAccess(project, grants, roles, principal, identity, usesNewPrivilegeSystem);
  }

  // Widens legacy forbids, then merges so a deny from one role isn't undone by another's allow.
  static rulesOf(grants: Grant[], roles: TProjectRoles): RuleSet<TProjectRule> {
    return RuleSet.merge(grants.map((grant) => roles.rulesFor(grant).map((rule) => expandLegacyForbid(rule))));
  }

  // Ignores OAuth scope narrowing. A custom role slugged "admin" doesn't count.
  get holdsBuiltInAdmin(): boolean {
    return this.grants.hasActiveBuiltInRole(ProjectMembershipRole.Admin);
  }

  roleRules(): RuleSet<TProjectRule> {
    return ProjectAccess.rulesOf(this.grants.active(), this.roles);
  }

  // Product overrides (e.g. Secrets folder grants) go after the role rules and win wherever they match.
  toPermission({ overrides }: { overrides?: RuleSet<TProjectRule> } = {}): ProjectPermission {
    const rules = overrides ? this.roleRules().then(overrides) : this.roleRules();
    return ProjectPermission.build({
      rules,
      project: this.project,
      grants: this.grants,
      principal: this.principal,
      identity: this.identity,
      usesNewPrivilegeSystem: this.usesNewPrivilegeSystem
    });
  }
}
