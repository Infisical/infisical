import { MongoAbility, subject } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultServiceActions,
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TGenericPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

import type { TAgentVaultServiceDALFactory } from "../agent-vault-access-bundle/agent-vault-service-dal";
import type { TAgentVaultSkillBundleDALFactory } from "../agent-vault-skill/agent-vault-skill-bundle-dal";
import { TAgentVaultReachDALFactory } from "./agent-vault-reach-dal";

type TProjectPermissionResult = Awaited<ReturnType<TPermissionServiceFactory["getProjectPermission"]>>;
type TAbility = MongoAbility<ProjectPermissionSet>;

export type TAgentVaultPermission = {
  permission: TProjectPermissionResult["permission"];
};

/**
 * What an actor can put in a session, from their roles. Each list is null when it covers every one in the project,
 * including those created later.
 *
 * - `accessBundleIds`: the bundles they can use. A session can carry one, and name its services and skills one by one.
 * - `serviceIds` / `skillIds`: the ones they can use directly, whether or not a bundle holds them.
 */
export type TAgentVaultReach = {
  accessBundleIds: string[] | null;
  serviceIds: string[] | null;
  skillIds: string[] | null;
};

export type TAgentVaultReachability = TAgentVaultPermission &
  TAgentVaultReach & {
    // Every bundle, service and skill, as Admin: nothing a session lists needs checking against a list.
    reachesEverything: boolean;
  };

export type TAgentVaultReachDep = Pick<
  TAgentVaultReachDALFactory,
  "findAccessBundleIds" | "findServiceIds" | "findSkillIds"
>;

type TPermissionDep = Pick<TPermissionServiceFactory, "getProjectPermission">;

const NOTHING: TAgentVaultReach = { accessBundleIds: [], serviceIds: [], skillIds: [] };

// Postgres matches a uuid in any case, but CASL compares condition values exactly, and roles store ids in lowercase. An
// id from a request can arrive in capitals, so a subject built from one is lowercased, or it would slip past a rule
// that denies that id.
export const agentVaultAccessBundleSubject = (accessBundleId: string) =>
  subject(ProjectPermissionSub.AgentVaultAccessBundles, { accessBundleId: accessBundleId.toLowerCase() });

export const agentVaultServiceSubject = (serviceId: string) =>
  subject(ProjectPermissionSub.AgentVaultServices, { serviceId: serviceId.toLowerCase() });

export const agentVaultSkillSubject = (skillId: string) =>
  subject(ProjectPermissionSub.AgentVaultSkills, { skillId: skillId.toLowerCase() });

// Whether the rules for this action cover every id without checking one: an unconditioned allow and no deny. CASL
// keeps the last matching rule, so any deny among them can take an id back and the ids have to be checked one by one.
const coverageOf = (permission: TAbility, action: string, subjectType: ProjectPermissionSub) => {
  // rulesFor's typing pairs each subject with its own actions; the action here is checked by the callers.
  const rules = (permission as unknown as MongoAbility).rulesFor(action, subjectType);
  if (!rules.some((rule) => !rule.inverted)) return "none" as const;
  if (rules.every((rule) => !rule.inverted) && rules.some((rule) => !rule.conditions)) return "all" as const;
  return "some" as const;
};

const idsAllowed = async (
  permission: TAbility,
  {
    action,
    subjectType,
    field,
    loadIds
  }: { action: string; subjectType: ProjectPermissionSub; field: string; loadIds: () => Promise<string[]> }
): Promise<string[] | null> => {
  const coverage = coverageOf(permission, action, subjectType);
  if (coverage === "none") return [];
  if (coverage === "all") return null;
  const ids = await loadIds();
  return ids.filter((id) => permission.can(action as never, subject(subjectType, { [field]: id }) as never));
};

// The machine identities a member list may show, null for every one: a role can limit identity read to some
// identities, and the platform's own identity list filters by the same check. loadIds lists the candidates.
export const readableIdentityIdsOf = (permission: TAbility, loadIds: () => Promise<string[]>) =>
  idsAllowed(permission, {
    action: ProjectPermissionIdentityActions.Read,
    subjectType: ProjectPermissionSub.Identity,
    field: "identityId",
    loadIds
  });

/**
 * The reach a permission gives in a project. Works on any actor's permission, so a session owner's, an on-behalf-of
 * user's and a group's are all worked out the same way.
 */
export const reachOf = async (
  permission: TProjectPermissionResult["permission"],
  { agentVaultReachDAL }: { agentVaultReachDAL: TAgentVaultReachDep },
  projectId: string,
  tx?: Knex
): Promise<TAgentVaultReach> => {
  const [accessBundleIds, serviceIds, skillIds] = await Promise.all([
    idsAllowed(permission, {
      action: ProjectPermissionAgentVaultAccessBundleActions.Use,
      subjectType: ProjectPermissionSub.AgentVaultAccessBundles,
      field: "accessBundleId",
      loadIds: () => agentVaultReachDAL.findAccessBundleIds(projectId, tx)
    }),
    idsAllowed(permission, {
      action: ProjectPermissionAgentVaultServiceActions.Use,
      subjectType: ProjectPermissionSub.AgentVaultServices,
      field: "serviceId",
      loadIds: () => agentVaultReachDAL.findServiceIds(projectId, tx)
    }),
    idsAllowed(permission, {
      action: ProjectPermissionAgentVaultSkillActions.Use,
      subjectType: ProjectPermissionSub.AgentVaultSkills,
      field: "skillId",
      loadIds: () => agentVaultReachDAL.findSkillIds(projectId, tx)
    })
  ]);
  return { accessBundleIds, serviceIds, skillIds };
};

type TIdCondition = string | { $eq?: string; $in?: string[] } | undefined;

/**
 * The ids the allow rules for this action pick out one by one (a bare id, `$eq` or `$in`), less any a deny takes back.
 * Unlike reachOf, a rule that covers every id picks out none, so it tells what a role gives its holder by name from
 * what it gives them along with everything else.
 */
export const idsPickedOutFor = (
  permission: TProjectPermissionResult["permission"],
  { action, subjectType, field }: { action: string; subjectType: ProjectPermissionSub; field: string }
) => {
  const picked = new Set<string>();
  // rulesFor's typing pairs each subject with its own actions; the action here is checked by the callers.
  (permission as unknown as MongoAbility).rulesFor(action, subjectType).forEach((rule) => {
    if (rule.inverted || !rule.conditions) return;
    const condition = (rule.conditions as Record<string, TIdCondition>)[field];
    if (typeof condition === "string") picked.add(condition.toLowerCase());
    else if (condition) {
      if (condition.$eq) picked.add(condition.$eq.toLowerCase());
      condition.$in?.forEach((id) => picked.add(id.toLowerCase()));
    }
  });
  return [...picked].filter((id) => permission.can(action as never, subject(subjectType, { [field]: id }) as never));
};

export const reachesEverythingIn = (reach: TAgentVaultReach) =>
  reach.accessBundleIds === null && reach.serviceIds === null && reach.skillIds === null;

// null covers everything, so intersecting with it returns the other side unchanged.
export const intersectIds = (a: string[] | null, b: string[] | null): string[] | null => {
  if (a === null) return b;
  if (b === null) return a;
  const inB = new Set(b);
  return a.filter((id) => inB.has(id));
};

// A session on a user's behalf reaches only what both the user and the machine identity reach.
export const intersectReach = (a: TAgentVaultReach, b: TAgentVaultReach): TAgentVaultReach => ({
  accessBundleIds: intersectIds(a.accessBundleIds, b.accessBundleIds),
  serviceIds: intersectIds(a.serviceIds, b.serviceIds),
  skillIds: intersectIds(a.skillIds, b.skillIds)
});

const unionIds = (a: string[] | null, b: string[] | null): string[] | null =>
  a === null || b === null ? null : [...new Set([...a, ...b])];

/**
 * The services a session can list: those used directly, and those a usable bundle holds. Session creation checks names
 * against it and the services list scopes itself to it, so the list offers exactly the services a session accepts.
 */
export const usableServiceIdsOf = async (
  deps: {
    agentVaultServiceDAL: Pick<TAgentVaultServiceDALFactory, "findIdsInBundles">;
    agentVaultReachDAL: Pick<TAgentVaultReachDALFactory, "findServiceIdsInAnyBundle">;
  },
  reach: TAgentVaultReach,
  projectId: string
): Promise<string[] | null> => {
  if (reach.serviceIds === null) return null;
  const throughBundles =
    reach.accessBundleIds === null
      ? await deps.agentVaultReachDAL.findServiceIdsInAnyBundle(projectId)
      : await deps.agentVaultServiceDAL.findIdsInBundles(reach.accessBundleIds);
  return unionIds(reach.serviceIds, throughBundles);
};

// The skills a session can list, the same rule as its services.
export const usableSkillIdsOf = async (
  deps: {
    agentVaultSkillBundleDAL: Pick<TAgentVaultSkillBundleDALFactory, "findSkillIdsInBundles">;
    agentVaultReachDAL: Pick<TAgentVaultReachDALFactory, "findSkillIdsInAnyBundle">;
  },
  reach: TAgentVaultReach,
  projectId: string
): Promise<string[] | null> => {
  if (reach.skillIds === null) return null;
  const throughBundles =
    reach.accessBundleIds === null
      ? await deps.agentVaultReachDAL.findSkillIdsInAnyBundle(projectId)
      : await deps.agentVaultSkillBundleDAL.findSkillIdsInBundles(reach.accessBundleIds);
  return unionIds(reach.skillIds, throughBundles);
};

/**
 * The ids among these the permission lets the actor see: `read` on them, or `use`, since a session can't name what its
 * creator can't find. Services and skills a usable bundle holds are added by the callers that list them.
 */
export const visibleIdsOf = (
  permission: TProjectPermissionResult["permission"],
  {
    subjectType,
    field,
    ids
  }: {
    subjectType:
      | ProjectPermissionSub.AgentVaultAccessBundles
      | ProjectPermissionSub.AgentVaultServices
      | ProjectPermissionSub.AgentVaultSkills;
    field: "accessBundleId" | "serviceId" | "skillId";
    ids: string[];
  }
) =>
  ids.filter((id) => {
    const target = subject(subjectType, { [field]: id }) as never;
    return permission.can("read" as never, target) || permission.can("use" as never, target);
  });

/**
 * The ids the actor can see, `read` or `use` on each, or null when either covers every one, including those created
 * later.
 */
export const visibleIdsWithin = async (
  permission: TProjectPermissionResult["permission"],
  {
    subjectType,
    field,
    loadIds
  }: {
    subjectType:
      | ProjectPermissionSub.AgentVaultAccessBundles
      | ProjectPermissionSub.AgentVaultServices
      | ProjectPermissionSub.AgentVaultSkills;
    field: "accessBundleId" | "serviceId" | "skillId";
    loadIds: () => Promise<string[]>;
  }
): Promise<string[] | null> => {
  const coverage = [coverageOf(permission, "read", subjectType), coverageOf(permission, "use", subjectType)];
  if (coverage.includes("all")) return null;
  if (coverage.every((entry) => entry === "none")) return [];
  return visibleIdsOf(permission, { subjectType, field, ids: await loadIds() });
};

export const unionWithin = (a: string[] | null, b: string[] | null): string[] | null =>
  a === null || b === null ? null : [...new Set([...a, ...b])];

const canSee = (
  permission: TProjectPermissionResult["permission"],
  subjectType: ProjectPermissionSub.AgentVaultServices | ProjectPermissionSub.AgentVaultSkills,
  field: "serviceId" | "skillId",
  id: string
) => {
  const target = subject(subjectType, { [field]: id }) as never;
  return permission.can("read" as never, target) || permission.can("use" as never, target);
};

/**
 * Whether the reader can see a project service: `read` or `use` on it, or a bundle they can use that holds it. Reads of
 * something that names services (a session, a delegation) leave out the ones the reader can't see, like deleted ones.
 */
export const serviceVisibilityOf = async (
  deps: Parameters<typeof usableServiceIdsOf>[0],
  {
    permission,
    reach,
    projectId
  }: { permission: TAgentVaultPermission["permission"]; reach: TAgentVaultReach; projectId: string }
) => {
  const usable = await usableServiceIdsOf(deps, reach, projectId);
  const usableSet = usable === null ? null : new Set(usable);
  return (serviceId: string) =>
    usableSet === null ||
    usableSet.has(serviceId) ||
    canSee(permission, ProjectPermissionSub.AgentVaultServices, "serviceId", serviceId);
};

// The same for a project skill.
export const skillVisibilityOf = async (
  deps: Parameters<typeof usableSkillIdsOf>[0],
  {
    permission,
    reach,
    projectId
  }: { permission: TAgentVaultPermission["permission"]; reach: TAgentVaultReach; projectId: string }
) => {
  const usable = await usableSkillIdsOf(deps, reach, projectId);
  const usableSet = usable === null ? null : new Set(usable);
  return (skillId: string) =>
    usableSet === null ||
    usableSet.has(skillId) ||
    canSee(permission, ProjectPermissionSub.AgentVaultSkills, "skillId", skillId);
};

const $loadAgentVaultPermission = async (
  { permissionService }: { permissionService: TPermissionDep },
  { projectId, ctx }: { projectId: string; ctx: TGenericPermission }
) =>
  permissionService.getProjectPermission({
    actor: ctx.actor,
    actorId: ctx.actorId,
    projectId,
    actorAuthMethod: ctx.actorAuthMethod,
    actorOrgId: ctx.actorOrgId,
    actionProjectType: ActionProjectType.AgentVault
  });

export const getAgentVaultPermission = async (
  deps: { permissionService: TPermissionDep },
  args: { projectId: string; ctx: TGenericPermission }
): Promise<TAgentVaultPermission> => {
  const { permission } = await $loadAgentVaultPermission(deps, args);
  return { permission };
};

// A service-layer filter rather than a CASL condition on each query: SQL can't evaluate a role's rules, so the ids a
// role covers are worked out here and the queries filter on them.
export const getAgentVaultReachability = async (
  {
    permissionService,
    agentVaultReachDAL
  }: { permissionService: TPermissionDep; agentVaultReachDAL: TAgentVaultReachDep },
  { projectId, ctx }: { projectId: string; ctx: TGenericPermission },
  tx?: Knex
): Promise<TAgentVaultReachability> => {
  const { permission } = await $loadAgentVaultPermission({ permissionService }, { projectId, ctx });
  // Only a user or machine identity can hold a session.
  if (ctx.actor !== ActorType.USER && ctx.actor !== ActorType.IDENTITY) {
    return { ...NOTHING, reachesEverything: false, permission };
  }
  const reach = await reachOf(permission, { agentVaultReachDAL }, projectId, tx);
  return { ...reach, reachesEverything: reachesEverythingIn(reach), permission };
};
