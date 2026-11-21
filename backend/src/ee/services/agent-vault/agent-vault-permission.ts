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

// The ids a role denies `use` on, or "all" when a deny covers every one, including those created later.
export type TAgentVaultDeniedIds = string[] | "all";

/**
 * What an actor can put in a session, from their roles. Each list is null when it covers every one in the project,
 * including those created later.
 *
 * - `accessBundleIds`: the bundles they can use. A session can carry one, and name its services and skills one by one.
 * - `serviceIds` / `skillIds`: the ones they can use directly, whether or not a bundle holds them.
 * - `deniedServiceIds` / `deniedSkillIds`: the ones a role denies `use` on. A bundle that holds one doesn't give it
 *   either, so a deny holds wherever the item sits. Left out when nothing is denied.
 */
export type TAgentVaultReach = {
  accessBundleIds: string[] | null;
  serviceIds: string[] | null;
  skillIds: string[] | null;
  deniedServiceIds?: TAgentVaultDeniedIds;
  deniedSkillIds?: TAgentVaultDeniedIds;
};

export type TAgentVaultReachability = TAgentVaultPermission & TAgentVaultReach;

export type TAgentVaultReachDep = Pick<
  TAgentVaultReachDALFactory,
  "findAccessBundleIds" | "findServiceIds" | "findSkillIds"
>;

type TPermissionDep = Pick<TPermissionServiceFactory, "getProjectPermission">;

export const REACHES_NOTHING: TAgentVaultReach = { accessBundleIds: [], serviceIds: [], skillIds: [] };

// Postgres matches a uuid in any case, but CASL compares condition values exactly, and roles store ids in lowercase. An
// id from a request can arrive in capitals, so a subject built from one is lowercased, or it would slip past a rule
// that denies that id.
export const agentVaultAccessBundleSubject = (accessBundleId: string) =>
  subject(ProjectPermissionSub.AgentVaultAccessBundles, { accessBundleId: accessBundleId.toLowerCase() });

export const agentVaultServiceSubject = (serviceId: string) =>
  subject(ProjectPermissionSub.AgentVaultServices, { serviceId: serviceId.toLowerCase() });

export const agentVaultSkillSubject = (skillId: string) =>
  subject(ProjectPermissionSub.AgentVaultSkills, { skillId: skillId.toLowerCase() });

// rulesFor's typing pairs each subject with its own actions; the action here is checked by the callers.
const rulesOf = (permission: TAbility, action: string, subjectType: ProjectPermissionSub) =>
  (permission as unknown as MongoAbility).rulesFor(action, subjectType);

const isDeniedFor = (permission: TAbility, action: string, subjectType: ProjectPermissionSub, field: string) => {
  const ability = permission as unknown as MongoAbility;
  return (id: string) => Boolean(ability.relevantRuleFor(action, subject(subjectType, { [field]: id }))?.inverted);
};

// Whether the rules for this action cover every id without checking one: an unconditioned allow and no deny. CASL
// keeps the last matching rule, so any deny among them can take an id back and the ids have to be checked one by one.
const coverageOf = (permission: TAbility, action: string, subjectType: ProjectPermissionSub) => {
  const rules = rulesOf(permission, action, subjectType);
  if (!rules.some((rule) => !rule.inverted)) return "none" as const;
  if (rules.every((rule) => !rule.inverted) && rules.some((rule) => !rule.conditions)) return "all" as const;
  return "some" as const;
};

type TIdCondition = string | { $eq?: string; $in?: string[] } | undefined;

// The ids a rule names one by one (a bare id, `$eq` or `$in`), or null when it isn't limited to named ids, as an
// unconditioned rule isn't.
const idsNamedBy = (rule: { conditions?: unknown }, field: string): string[] | null => {
  if (!rule.conditions) return null;
  const condition = (rule.conditions as Record<string, TIdCondition>)[field];
  if (typeof condition === "string") return [condition.toLowerCase()];
  if (!condition || Object.keys(condition).some((key) => key !== "$eq" && key !== "$in")) return null;
  return [...(condition.$eq ? [condition.$eq] : []), ...(condition.$in ?? [])].map((id) => id.toLowerCase());
};

type TIdRules = { action: string; subjectType: ProjectPermissionSub; field: string };

const idsAllowed = async (
  permission: TAbility,
  {
    action,
    subjectType,
    field,
    loadIds
  }: TIdRules & {
    // Lists the candidates, only those among onlyIds when it is given.
    loadIds: (onlyIds?: string[]) => Promise<string[]>;
  }
): Promise<string[] | null> => {
  const coverage = coverageOf(permission, action, subjectType);
  if (coverage === "none") return [];
  if (coverage === "all") return null;
  // When every allow names its ids, no other id can pass, so only those are looked up.
  const named = rulesOf(permission, action, subjectType)
    .filter((rule) => !rule.inverted)
    .map((rule) => idsNamedBy(rule, field));
  const ids = named.every((namedIds) => namedIds !== null)
    ? await loadIds([...new Set(named.flatMap((namedIds) => namedIds ?? []))])
    : await loadIds();
  return ids.filter((id) => permission.can(action as never, subject(subjectType, { [field]: id }) as never));
};

// Matches no row, so a deny that matches it covers ids no rule names, as an unconditioned deny does.
const ANY_ID = "00000000-0000-0000-0000-000000000000";

// The ids a deny on this action takes back: those the denies name, or "all" when one covers every id. Checked through
// relevantRuleFor, so a deny that a later allow overrides doesn't count.
const deniedIdsOf = (permission: TAbility, { action, subjectType, field }: TIdRules): TAgentVaultDeniedIds => {
  const denies = rulesOf(permission, action, subjectType).filter((rule) => rule.inverted);
  if (!denies.length) return [];
  const isDenied = isDeniedFor(permission, action, subjectType, field);
  if (isDenied(ANY_ID)) return "all";
  return [...new Set(denies.flatMap((rule) => idsNamedBy(rule, field) ?? []))].filter(isDenied);
};

const isNothingDenied = (denied: TAgentVaultDeniedIds | undefined) => denied !== "all" && !denied?.length;

// Leaves out a denied list that holds nothing, so a reach with no deny carries only its three lists.
const withDenied = (
  reach: Pick<TAgentVaultReach, "accessBundleIds" | "serviceIds" | "skillIds">,
  { deniedServiceIds, deniedSkillIds }: Pick<TAgentVaultReach, "deniedServiceIds" | "deniedSkillIds">
): TAgentVaultReach => ({
  ...reach,
  ...(isNothingDenied(deniedServiceIds) ? {} : { deniedServiceIds }),
  ...(isNothingDenied(deniedSkillIds) ? {} : { deniedSkillIds })
});

// The machine identities a member list may show, null for every one: a role can limit identity read to some
// identities, and the platform's own identity list filters by the same check. loadIds lists the candidates.
export const readableIdentityIdsOf = (permission: TAbility, loadIds: () => Promise<string[]>) =>
  idsAllowed(permission, {
    action: ProjectPermissionIdentityActions.Read,
    subjectType: ProjectPermissionSub.Identity,
    field: "identityId",
    loadIds: () => loadIds()
  });

const BUNDLE_USE: TIdRules = {
  action: ProjectPermissionAgentVaultAccessBundleActions.Use,
  subjectType: ProjectPermissionSub.AgentVaultAccessBundles,
  field: "accessBundleId"
};
const SERVICE_USE: TIdRules = {
  action: ProjectPermissionAgentVaultServiceActions.Use,
  subjectType: ProjectPermissionSub.AgentVaultServices,
  field: "serviceId"
};
const SKILL_USE: TIdRules = {
  action: ProjectPermissionAgentVaultSkillActions.Use,
  subjectType: ProjectPermissionSub.AgentVaultSkills,
  field: "skillId"
};

// Which of the reach's lists to work out. One left out reaches nothing, for a caller that never reads it.
export type TAgentVaultReachKinds = { services?: boolean; skills?: boolean };

/**
 * The reach a permission gives in a project. Works on any actor's permission, so a session owner's, an on-behalf-of
 * user's and a group's are all worked out the same way.
 */
export const reachOf = async (
  permission: TProjectPermissionResult["permission"],
  { agentVaultReachDAL }: { agentVaultReachDAL: TAgentVaultReachDep },
  projectId: string,
  tx?: Knex,
  { services = true, skills = true }: TAgentVaultReachKinds = {}
): Promise<TAgentVaultReach> => {
  const [accessBundleIds, serviceIds, skillIds] = await Promise.all([
    idsAllowed(permission, {
      ...BUNDLE_USE,
      loadIds: (onlyIds) => agentVaultReachDAL.findAccessBundleIds(projectId, tx, onlyIds)
    }),
    services
      ? idsAllowed(permission, {
          ...SERVICE_USE,
          loadIds: (onlyIds) => agentVaultReachDAL.findServiceIds(projectId, tx, onlyIds)
        })
      : [],
    skills
      ? idsAllowed(permission, {
          ...SKILL_USE,
          loadIds: (onlyIds) => agentVaultReachDAL.findSkillIds(projectId, tx, onlyIds)
        })
      : []
  ]);
  return withDenied(
    { accessBundleIds, serviceIds, skillIds },
    {
      deniedServiceIds: services ? deniedIdsOf(permission, SERVICE_USE) : [],
      deniedSkillIds: skills ? deniedIdsOf(permission, SKILL_USE) : []
    }
  );
};

/**
 * The ids the allow rules for this action pick out one by one (a bare id, `$eq` or `$in`), less any a deny takes back.
 * Unlike reachOf, a rule that covers every id picks out none, so it tells what a role gives its holder by name from
 * what it gives them along with everything else.
 */
export const idsPickedOutFor = (permission: TProjectPermissionResult["permission"], rules: TIdRules) => {
  const picked = new Set(
    rulesOf(permission, rules.action, rules.subjectType)
      .filter((rule) => !rule.inverted)
      .flatMap((rule) => idsNamedBy(rule, rules.field) ?? [])
  );
  return [...picked].filter((id) =>
    permission.can(rules.action as never, subject(rules.subjectType, { [rules.field]: id }) as never)
  );
};

// null covers everything, so intersecting with it returns the other side unchanged.
export const intersectIds = (a: string[] | null, b: string[] | null): string[] | null => {
  if (a === null) return b;
  if (b === null) return a;
  const inB = new Set(b);
  return a.filter((id) => inB.has(id));
};

const unionDenied = (a?: TAgentVaultDeniedIds, b?: TAgentVaultDeniedIds): TAgentVaultDeniedIds =>
  a === "all" || b === "all" ? "all" : [...new Set([...(a ?? []), ...(b ?? [])])];

// A session on a user's behalf reaches only what both the user and the machine identity reach, and either one's deny
// holds.
export const intersectReach = (a: TAgentVaultReach, b: TAgentVaultReach): TAgentVaultReach =>
  withDenied(
    {
      accessBundleIds: intersectIds(a.accessBundleIds, b.accessBundleIds),
      serviceIds: intersectIds(a.serviceIds, b.serviceIds),
      skillIds: intersectIds(a.skillIds, b.skillIds)
    },
    {
      deniedServiceIds: unionDenied(a.deniedServiceIds, b.deniedServiceIds),
      deniedSkillIds: unionDenied(a.deniedSkillIds, b.deniedSkillIds)
    }
  );

export const unionWithin = (a: string[] | null, b: string[] | null): string[] | null =>
  a === null || b === null ? null : [...new Set([...a, ...b])];

// What a reach can use of one kind: the ids it uses directly, and those its bundles hold, less the ones a role denies.
// A deny wins over the allow that would list an id directly, so "all" leaves only the direct ones, which it never
// covers.
const usableIds = async (
  direct: string[],
  denied: TAgentVaultDeniedIds | undefined,
  loadThroughBundles: () => Promise<string[]>
) => {
  if (denied === "all") return direct;
  const deniedIds = new Set(denied ?? []);
  return [...new Set([...direct, ...(await loadThroughBundles())])].filter((id) => !deniedIds.has(id));
};

/**
 * The services a session can list: those used directly, and those a usable bundle holds, less any a role denies.
 * Session creation checks names against it and the services list scopes itself to it, so the list offers exactly the
 * services a session accepts.
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
  return usableIds(reach.serviceIds, reach.deniedServiceIds, () =>
    reach.accessBundleIds === null
      ? deps.agentVaultReachDAL.findServiceIdsInAnyBundle(projectId)
      : deps.agentVaultServiceDAL.findIdsInBundles(reach.accessBundleIds)
  );
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
  return usableIds(reach.skillIds, reach.deniedSkillIds, () =>
    reach.accessBundleIds === null
      ? deps.agentVaultReachDAL.findSkillIdsInAnyBundle(projectId)
      : deps.agentVaultSkillBundleDAL.findSkillIdsInBundles(reach.accessBundleIds)
  );
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
    return { ...REACHES_NOTHING, permission };
  }
  const reach = await reachOf(permission, { agentVaultReachDAL }, projectId, tx);
  return { ...reach, permission };
};
