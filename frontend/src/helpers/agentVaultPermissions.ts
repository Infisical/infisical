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

// A bundle is a package: using it gives everything in it, whatever a role says about one of its services or skills. A
// deny on the item only stops using it on its own.
const isInUsableBundle = (permission: MongoAbility<ProjectPermissionSet>, item: TBundledItem) =>
  item.accessBundles.some((bundle) => canUseAgentVaultAccessBundle(permission, bundle.id));

export const canUseAgentVaultService = (
  permission: MongoAbility<ProjectPermissionSet>,
  service: TBundledItem
) =>
  canOnAgentVaultService(permission, ProjectPermissionAgentVaultServiceActions.Use, service.id) ||
  isInUsableBundle(permission, service);

export const canUseAgentVaultSkill = (
  permission: MongoAbility<ProjectPermissionSet>,
  skill: TBundledItem
) =>
  canOnAgentVaultSkill(permission, ProjectPermissionAgentVaultSkillActions.Use, skill.id) ||
  isInUsableBundle(permission, skill);

// Picking a service or skill for a session on its own is refused when a role denies Use on it, even though a bundle that
// holds it still gives it.
export const canPickAgentVaultService = (
  permission: MongoAbility<ProjectPermissionSet>,
  service: TBundledItem
) =>
  canUseAgentVaultService(permission, service) &&
  !permission.relevantRuleFor(
    ProjectPermissionAgentVaultServiceActions.Use,
    subject(ProjectPermissionSub.AgentVaultServices, { serviceId: service.id })
  )?.inverted;

export const canPickAgentVaultSkill = (
  permission: MongoAbility<ProjectPermissionSet>,
  skill: TBundledItem
) =>
  canUseAgentVaultSkill(permission, skill) &&
  !permission.relevantRuleFor(
    ProjectPermissionAgentVaultSkillActions.Use,
    subject(ProjectPermissionSub.AgentVaultSkills, { skillId: skill.id })
  )?.inverted;

// Adding a service or skill to a bundle takes Use on the item from the caller's own roles. Reaching it through another
// bundle doesn't count: that would let someone copy a wildcard service out of a bundle that narrows one of its hosts,
// and so escape the narrower service's limits.
export const canAddServiceToAgentVaultBundle = (
  permission: MongoAbility<ProjectPermissionSet>,
  serviceId: string
) => canOnAgentVaultService(permission, ProjectPermissionAgentVaultServiceActions.Use, serviceId);

export const canAddSkillToAgentVaultBundle = (
  permission: MongoAbility<ProjectPermissionSet>,
  skillId: string
) => canOnAgentVaultSkill(permission, ProjectPermissionAgentVaultSkillActions.Use, skillId);

// Adding a skill to a bundle takes being able to use it, and a skill just created is in no bundle yet. A rule can name
// only ids that already exist, so for a new skill only the rules without conditions count, and the first of those
// decides, as CASL lists an action's rules most relevant first. A made-up id wouldn't do: a rule may name any fixed one,
// and crypto.randomUUID is missing from a dashboard served over plain HTTP.
export const canUseNewAgentVaultSkill = (permission: MongoAbility<ProjectPermissionSet>) => {
  const decidingRule = permission
    .rulesFor(ProjectPermissionAgentVaultSkillActions.Use, ProjectPermissionSub.AgentVaultSkills)
    .find((rule) => !rule.conditions);
  return Boolean(decidingRule && !decidingRule.inverted);
};

// Creating a service straight into a bundle puts it in that bundle, which takes using it, the same way as for a skill.
export const canUseNewAgentVaultService = (permission: MongoAbility<ProjectPermissionSet>) => {
  const decidingRule = permission
    .rulesFor(
      ProjectPermissionAgentVaultServiceActions.Use,
      ProjectPermissionSub.AgentVaultServices
    )
    .find((rule) => !rule.conditions);
  return Boolean(decidingRule && !decidingRule.inverted);
};

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

export const agentVaultSessionSubject = (actorId: string | null) =>
  subject(ProjectPermissionSub.AgentVaultSessions, { actorId });

// Stands in for every actor but the caller. A role names whose sessions it covers only as the caller or as everyone
// else, so any other actor's session is decided the same way as this id's.
const ANOTHER_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

// Whether the caller can see sessions other people started, which listing everyone's sessions takes.
export const canReadOthersAgentVaultSessions = (permission: MongoAbility<ProjectPermissionSet>) =>
  permission.can(
    ProjectPermissionAgentVaultSessionActions.Read,
    agentVaultSessionSubject(ANOTHER_ACTOR_ID)
  );

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
  canReadOthersAgentVaultSessions(permission);

const SESSION_ACTIONS = {
  edit: ProjectPermissionAgentVaultSessionActions.Edit,
  revoke: ProjectPermissionAgentVaultSessionActions.Revoke
} as const;

// The permission comes with the caller's id filled in where a role names {{identity.id}}, so a session is checked by
// who started it.
export const canActOnAgentVaultSession = (
  permission: MongoAbility<ProjectPermissionSet>,
  session: Pick<TAgentVaultSession, "actor">,
  change: keyof typeof SESSION_ACTIONS
) => permission.can(SESSION_ACTIONS[change], agentVaultSessionSubject(session.actor.id));
