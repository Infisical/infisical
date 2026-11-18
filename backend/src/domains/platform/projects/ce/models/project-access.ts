import { MongoAbility, RawRuleOf } from "@casl/ability";

import { ActorGrants, Grant, RuleIdentity, RuleSet } from "@app/domains/platform/access-control/ce/module";
import type { TPrincipal } from "@app/lib/auth/principal";

import { Project } from "./project";
import { ProjectPermission } from "./project-permission";
import {
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "./project-permission-set";
import { TProjectRoles, TProjectRule } from "./standard-project-roles";

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

// An actor's place in one project: the project, what it holds there, and what those roles mean in the project's
// product. Products build their permission on it.
export class ProjectAccess {
  private constructor(
    readonly project: Project,
    readonly grants: ActorGrants,
    private readonly roles: TProjectRoles,
    private readonly principal: TPrincipal,
    private readonly identity: RuleIdentity
  ) {}

  static create({
    project,
    grants,
    roles,
    principal,
    identity
  }: {
    project: Project;
    grants: ActorGrants;
    roles: TProjectRoles;
    principal: TPrincipal;
    identity: RuleIdentity;
  }): ProjectAccess {
    return new ProjectAccess(project, grants, roles, principal, identity);
  }

  // Several roles and privileges held together, as this product defines them: legacy forbids widened, then merged so
  // a deny from one is not undone by another's allow.
  static rulesOf(grants: Grant[], roles: TProjectRoles): RuleSet<TProjectRule> {
    return RuleSet.merge(grants.map((grant) => roles.rulesFor(grant).map((rule) => expandLegacyForbid(rule))));
  }

  // A built-in admin of the project. A custom role slugged "admin" is not.
  get isAdmin(): boolean {
    return this.grants.hasActiveBuiltInRole("admin");
  }

  roleRules(): RuleSet<TProjectRule> {
    return ProjectAccess.rulesOf(this.grants.active(), this.roles);
  }

  // The permission from the actor's roles, with a product's own rules after them where it has any (Secrets' folder
  // grants), which decide wherever they match.
  toPermission({ overrides }: { overrides?: RuleSet<TProjectRule> } = {}): ProjectPermission {
    const rules = overrides ? this.roleRules().then(overrides) : this.roleRules();
    return ProjectPermission.build({
      rules,
      project: this.project,
      grants: this.grants,
      principal: this.principal,
      identity: this.identity
    });
  }
}
