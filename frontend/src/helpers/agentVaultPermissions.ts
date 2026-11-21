import { MongoAbility, subject } from "@casl/ability";

import {
  ProjectPermissionActions,
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultServiceActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";

// The library is for anyone who can read or use some skill, which its list needs. Skills reached only through a bundle
// show on that bundle's page.
export const canReadAgentVaultSkills = (permission: MongoAbility<ProjectPermissionSet>) =>
  [ProjectPermissionAgentVaultSkillActions.Read, ProjectPermissionAgentVaultSkillActions.Use].some(
    (action) => permission.can(action, ProjectPermissionSub.AgentVaultSkills)
  );

// Services take their own subject: creating, editing and deleting them is what managing them means.
export const canManageAgentVaultServices = (permission: MongoAbility<ProjectPermissionSet>) =>
  [
    ProjectPermissionAgentVaultServiceActions.Create,
    ProjectPermissionAgentVaultServiceActions.Edit,
    ProjectPermissionAgentVaultServiceActions.Delete
  ].some((action) => permission.can(action, ProjectPermissionSub.AgentVaultServices));

// Whether some service could be the caller's to use, directly or through a bundle, which is what personal values and
// the setup counts are about.
export const canUseAgentVaultServices = (permission: MongoAbility<ProjectPermissionSet>) =>
  permission.can(
    ProjectPermissionAgentVaultAccessBundleActions.Use,
    ProjectPermissionSub.AgentVaultAccessBundles
  ) ||
  permission.can(
    ProjectPermissionAgentVaultServiceActions.Use,
    ProjectPermissionSub.AgentVaultServices
  );

export const canUseAgentVaultAccessBundles = (permission: MongoAbility<ProjectPermissionSet>) =>
  permission.can(
    ProjectPermissionAgentVaultAccessBundleActions.Use,
    ProjectPermissionSub.AgentVaultAccessBundles
  );

// Whether some skill could be the caller's to put in a session, directly or through a bundle.
export const canUseAgentVaultSkills = (permission: MongoAbility<ProjectPermissionSet>) =>
  canUseAgentVaultAccessBundles(permission) ||
  permission.can(
    ProjectPermissionAgentVaultSkillActions.Use,
    ProjectPermissionSub.AgentVaultSkills
  );

// Each list below refuses a role with none of these, so the nav leaves the page out and the page shows the restricted
// state instead of a failed request.
export const canReadAgentVaultSessions = (permission: MongoAbility<ProjectPermissionSet>) =>
  permission.can(
    ProjectPermissionAgentVaultSessionActions.Read,
    ProjectPermissionSub.AgentVaultSessions
  );

export const canReadAgentVaultAccessBundles = (permission: MongoAbility<ProjectPermissionSet>) =>
  [
    ProjectPermissionAgentVaultAccessBundleActions.Read,
    ProjectPermissionAgentVaultAccessBundleActions.Use
  ].some((action) => permission.can(action, ProjectPermissionSub.AgentVaultAccessBundles));

// A service in a bundle the caller can use counts as theirs to see.
export const canReadAgentVaultServices = (permission: MongoAbility<ProjectPermissionSet>) =>
  [
    ProjectPermissionAgentVaultServiceActions.Read,
    ProjectPermissionAgentVaultServiceActions.Use
  ].some((action) => permission.can(action, ProjectPermissionSub.AgentVaultServices)) ||
  permission.can(
    ProjectPermissionAgentVaultAccessBundleActions.Use,
    ProjectPermissionSub.AgentVaultAccessBundles
  );

export const canReadAgentVaultProxies = (permission: MongoAbility<ProjectPermissionSet>) =>
  permission.can(
    ProjectPermissionAgentVaultProxyActions.Read,
    ProjectPermissionSub.AgentVaultProxies
  );

export const canOnAgentVaultAccessBundle = (
  permission: MongoAbility<ProjectPermissionSet>,
  action: ProjectPermissionAgentVaultAccessBundleActions,
  accessBundleId: string
) =>
  permission.can(action, subject(ProjectPermissionSub.AgentVaultAccessBundles, { accessBundleId }));

export const canOnAgentVaultService = (
  permission: MongoAbility<ProjectPermissionSet>,
  action: ProjectPermissionAgentVaultServiceActions,
  serviceId: string
) => permission.can(action, subject(ProjectPermissionSub.AgentVaultServices, { serviceId }));

export const canOnAgentVaultSkill = (
  permission: MongoAbility<ProjectPermissionSet>,
  action: ProjectPermissionAgentVaultSkillActions,
  skillId: string
) => permission.can(action, subject(ProjectPermissionSub.AgentVaultSkills, { skillId }));

// What a session can carry: lists also return what the caller can only read, which a session is refused.
export const canUseAgentVaultAccessBundle = (
  permission: MongoAbility<ProjectPermissionSet>,
  accessBundleId: string
) =>
  canOnAgentVaultAccessBundle(
    permission,
    ProjectPermissionAgentVaultAccessBundleActions.Use,
    accessBundleId
  );

type TBundledItem = { id: string; accessBundles: { id: string }[] };

// A role's deny on a service or skill holds even inside a bundle the caller can use, so only an item no rule denies
// comes through a bundle.
const isInUsableBundle = (permission: MongoAbility<ProjectPermissionSet>, item: TBundledItem) =>
  item.accessBundles.some((bundle) => canUseAgentVaultAccessBundle(permission, bundle.id));

export const canUseAgentVaultService = (
  permission: MongoAbility<ProjectPermissionSet>,
  service: TBundledItem
) => {
  const target = subject(ProjectPermissionSub.AgentVaultServices, { serviceId: service.id });
  return (
    permission.can(ProjectPermissionAgentVaultServiceActions.Use, target) ||
    (!permission.relevantRuleFor(ProjectPermissionAgentVaultServiceActions.Use, target)?.inverted &&
      isInUsableBundle(permission, service))
  );
};

export const canUseAgentVaultSkill = (
  permission: MongoAbility<ProjectPermissionSet>,
  skill: TBundledItem
) => {
  const target = subject(ProjectPermissionSub.AgentVaultSkills, { skillId: skill.id });
  return (
    permission.can(ProjectPermissionAgentVaultSkillActions.Use, target) ||
    (!permission.relevantRuleFor(ProjectPermissionAgentVaultSkillActions.Use, target)?.inverted &&
      isInUsableBundle(permission, skill))
  );
};

// Adding a skill to a bundle takes being able to use it, and a skill just created is in no bundle yet. No rule can name
// an id made just now, so checking one asks whether the caller's roles let them use every new skill. A fixed id
// wouldn't do: a rule may name any id.
export const canUseNewAgentVaultSkill = (permission: MongoAbility<ProjectPermissionSet>) =>
  canOnAgentVaultSkill(
    permission,
    ProjectPermissionAgentVaultSkillActions.Use,
    crypto.randomUUID()
  );

// The members API takes adding a member, or changing one's roles, on users, groups and machine identities alike when a
// request names all three kinds, so assigning a role from anywhere needs Create and Edit on all three.
export const canChangeAgentVaultMembers = (permission: MongoAbility<ProjectPermissionSet>) =>
  [ProjectPermissionMemberActions.Create, ProjectPermissionMemberActions.Edit].every((action) =>
    permission.can(action, ProjectPermissionSub.Member)
  ) &&
  [ProjectPermissionActions.Create, ProjectPermissionActions.Edit].every((action) =>
    permission.can(action, ProjectPermissionSub.Groups)
  ) &&
  [ProjectPermissionIdentityActions.Create, ProjectPermissionIdentityActions.Edit].every((action) =>
    permission.can(action, ProjectPermissionSub.Identity)
  );

// The members list answers with the kinds of member the caller can read, so reading any one of them is enough.
export const canReadAgentVaultMembers = (permission: MongoAbility<ProjectPermissionSet>) =>
  permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member) ||
  permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups) ||
  permission.can(ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity);

// Only then does the members list hold everyone, so a count from it can say nobody holds a role. The list leaves out
// each machine identity the caller's roles can't read, so identity read has to cover every one: an allow without
// conditions, and no deny.
export const canReadEveryAgentVaultMember = (permission: MongoAbility<ProjectPermissionSet>) => {
  const identityRules = permission.rulesFor(
    ProjectPermissionIdentityActions.Read,
    ProjectPermissionSub.Identity
  );
  return (
    permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member) &&
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups) &&
    identityRules.some((rule) => !rule.inverted && !rule.conditions) &&
    identityRules.every((rule) => !rule.inverted)
  );
};

// Access Control has a tab for each kind of member and one for roles, so reading any of them opens it.
export const canOpenAgentVaultAccessControl = (permission: MongoAbility<ProjectPermissionSet>) =>
  canReadAgentVaultMembers(permission) ||
  permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);

// The setup checklist walks through a proxy, a bundle, a service created into it and the project's first session, and
// checks the last by listing everyone's sessions, so it is only for someone who can do all of that.
export const canSetUpAgentVault = (permission: MongoAbility<ProjectPermissionSet>) =>
  permission.can(
    ProjectPermissionAgentVaultProxyActions.Create,
    ProjectPermissionSub.AgentVaultProxies
  ) &&
  permission.can(
    ProjectPermissionAgentVaultAccessBundleActions.Create,
    ProjectPermissionSub.AgentVaultAccessBundles
  ) &&
  permission.can(
    ProjectPermissionAgentVaultAccessBundleActions.Edit,
    ProjectPermissionSub.AgentVaultAccessBundles
  ) &&
  permission.can(
    ProjectPermissionAgentVaultServiceActions.Create,
    ProjectPermissionSub.AgentVaultServices
  ) &&
  permission.can(
    ProjectPermissionAgentVaultSessionActions.ReadAny,
    ProjectPermissionSub.AgentVaultSessions
  );

const SESSION_ACTIONS = {
  edit: [
    ProjectPermissionAgentVaultSessionActions.Edit,
    ProjectPermissionAgentVaultSessionActions.EditAny
  ],
  revoke: [
    ProjectPermissionAgentVaultSessionActions.Revoke,
    ProjectPermissionAgentVaultSessionActions.RevokeAny
  ]
} as const;

// The API takes the plain action for every session and the -any one on top for a session someone else owns. The
// dashboard always acts as a user, so a session is the caller's own when a user with their id holds it.
export const canActOnAgentVaultSession = (
  permission: MongoAbility<ProjectPermissionSet>,
  userId: string,
  session: Pick<TAgentVaultSession, "actor">,
  change: keyof typeof SESSION_ACTIONS
) => {
  const [own, any] = SESSION_ACTIONS[change];
  const isOwn = session.actor.type === AgentVaultMemberType.User && session.actor.id === userId;
  return (
    permission.can(own, ProjectPermissionSub.AgentVaultSessions) &&
    (isOwn || permission.can(any, ProjectPermissionSub.AgentVaultSessions))
  );
};
