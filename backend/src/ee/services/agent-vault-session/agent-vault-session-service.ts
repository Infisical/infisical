import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultHookActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import { TAgentVaultServiceDALFactory } from "../agent-vault-access-bundle/agent-vault-service-dal";
import { TAgentVaultDelegationDALFactory } from "../agent-vault-delegation/agent-vault-delegation-dal";
import { findCallerDelegation, resolveOnBehalfOfUser } from "../agent-vault-delegation/agent-vault-on-behalf-of-fns";
import { TAgentVaultHookDALFactory } from "../agent-vault-hook/agent-vault-hook-dal";
import {
  assertAgentVaultHooksOnPlan,
  hookNotFoundByName,
  NO_SERVICE_HOOK,
  toServiceHookColumns
} from "../agent-vault-hook/agent-vault-hook-fns";
import { TAgentVaultResolveDALFactory } from "../agent-vault-proxy/agent-vault-resolve-dal";
import { generateSessionLogKey, wrapSessionLogKey } from "../agent-vault-session-log/agent-vault-session-log-secrets";
import { TAgentVaultSkillBundleDALFactory } from "../agent-vault-skill/agent-vault-skill-bundle-dal";
import { TAgentVaultSkillDALFactory } from "../agent-vault-skill/agent-vault-skill-dal";
import { TAgentVaultVariableDALFactory } from "../agent-vault-variable/agent-vault-variable-dal";
import { findHostPatternConflicts } from "../agent-vault/agent-vault-conflict-fns";
import { isForeignKeyViolation } from "../agent-vault/agent-vault-db-error-fns";
import { AgentVaultMemberType, AgentVaultServiceType, AgentVaultSessionScope } from "../agent-vault/agent-vault-enums";
import {
  getAgentVaultPermission,
  getAgentVaultReachability,
  intersectAccessBundleIds,
  serviceIdsReachedThrough,
  skillIdsReachedThrough,
  TAgentVaultPermission
} from "../agent-vault/agent-vault-permission";
import { TAgentVaultSessionAccessBundleDALFactory } from "./agent-vault-session-access-bundle-dal";
import { TAgentVaultSessionDALFactory, TAgentVaultSessionListRow } from "./agent-vault-session-dal";
import {
  deriveSessionStatus,
  generateSessionToken,
  isSameSessionMetadata,
  TAgentVaultSessionMetadata
} from "./agent-vault-session-fns";
import {
  TAgentVaultInlineServiceInsert,
  TAgentVaultSessionInlineServiceDALFactory
} from "./agent-vault-session-inline-service-dal";
import {
  assertNoAccessBundleConflicts,
  assertNoServiceConflicts,
  assertNoOverrideConflicts,
  bindInlineOauthVariables,
  inlineOauthVariableIdsOf,
  prepareInlineServices,
  TInlineOauthVariableKeys,
  toInlineServiceSummary
} from "./agent-vault-session-inline-service-fns";
import {
  TAgentVaultInlineSkillInsert,
  TAgentVaultSessionInlineSkillDALFactory
} from "./agent-vault-session-inline-skill-dal";
import { prepareInlineSkills, toInlineSkillSummary } from "./agent-vault-session-inline-skill-fns";
import { TAgentVaultSessionServiceDALFactory } from "./agent-vault-session-service-dal";
import { TAgentVaultSessionSkillDALFactory } from "./agent-vault-session-skill-dal";
import {
  TAgentVaultSessionServiceSummary,
  TAgentVaultSessionSkillSummary,
  TGetSessionByIdDTO,
  TListSessionsDTO,
  TMintSessionDTO,
  TRevokeSessionDTO,
  TUpdateSessionDTO
} from "./agent-vault-session-types";

export const AGENT_VAULT_SESSION_DEFAULT_TTL = "7d";
export const AGENT_VAULT_SESSION_TTL_NEVER = "never";
// Past roughly 1e8 days the expiry overflows Date and Postgres rejects the row as a 500. A century is
// far beyond any real lifetime and keeps the message honest; "never" exists for no expiry at all.
export const AGENT_VAULT_SESSION_MAX_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000;
// The user an on-behalf-of session acts for didn't start it and may not know it exists, so it is short by default.
// It should probably have a maximum too, but for now any TTL is allowed, never included.
export const AGENT_VAULT_ON_BEHALF_OF_SESSION_DEFAULT_TTL = "1h";

type TAgentVaultSessionServiceFactoryDep = {
  agentVaultSessionDAL: TAgentVaultSessionDALFactory;
  agentVaultHookDAL: Pick<TAgentVaultHookDALFactory, "findByNamesForService" | "findNamesByIds">;
  agentVaultSessionAccessBundleDAL: TAgentVaultSessionAccessBundleDALFactory;
  agentVaultSessionInlineServiceDAL: Pick<
    TAgentVaultSessionInlineServiceDALFactory,
    "insertForSession" | "findSummariesBySessionIds" | "deleteSecretsBySessionId"
  >;
  agentVaultSessionServiceDAL: Pick<TAgentVaultSessionServiceDALFactory, "insertMany" | "findSummariesBySessionIds">;
  agentVaultSessionSkillDAL: Pick<TAgentVaultSessionSkillDALFactory, "insertMany" | "findSummariesBySessionIds">;
  agentVaultSessionInlineSkillDAL: Pick<
    TAgentVaultSessionInlineSkillDALFactory,
    "insertForSession" | "findSummariesBySessionIds" | "deleteFilesBySessionId"
  >;
  agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "find">;
  agentVaultServiceDAL: Pick<
    TAgentVaultServiceDALFactory,
    "find" | "findByAccessBundleId" | "findCatalogByNames" | "findIdsInBundles"
  >;
  agentVaultVariableDAL: Pick<TAgentVaultVariableDALFactory, "findKeys" | "findOauthForResolve">;
  agentVaultSkillDAL: Pick<TAgentVaultSkillDALFactory, "findByNamesInProject">;
  agentVaultSkillBundleDAL: Pick<TAgentVaultSkillBundleDALFactory, "findSkillIdsInBundles" | "findSkillsForBundle">;
  agentVaultDelegationDAL: Pick<TAgentVaultDelegationDALFactory, "findForIdentity" | "coversUser">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find" | "insertMany" | "delete">;
  agentVaultResolveDAL: Pick<TAgentVaultResolveDALFactory, "findServiceOverrides">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  userDAL: Pick<TUserDALFactory, "findOne">;
  orgDAL: Pick<TOrgDALFactory, "findEffectiveOrgMembership">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsDataKeyService: TKmsDataKeyService;
  licenseService: Pick<TLicenseService, "getPlan">;
};

export type TAgentVaultSessionServiceFactory = ReturnType<typeof agentVaultSessionServiceFactory>;

const readHostPattern = (type: AgentVaultServiceType, hostPattern?: string | null) =>
  type === AgentVaultServiceType.Http || type === AgentVaultServiceType.Mcp ? (hostPattern ?? null) : null;

export const agentVaultSessionServiceFactory = ({
  agentVaultSessionDAL,
  agentVaultHookDAL,
  agentVaultSessionAccessBundleDAL,
  agentVaultSessionInlineServiceDAL,
  agentVaultSessionServiceDAL,
  agentVaultSessionSkillDAL,
  agentVaultSessionInlineSkillDAL,
  agentVaultAccessBundleDAL,
  agentVaultServiceDAL,
  agentVaultVariableDAL,
  agentVaultSkillDAL,
  agentVaultSkillBundleDAL,
  agentVaultDelegationDAL,
  resourceMetadataDAL,
  agentVaultResolveDAL,
  membershipDAL,
  userDAL,
  orgDAL,
  permissionService,
  kmsDataKeyService,
  licenseService
}: TAgentVaultSessionServiceFactoryDep) => {
  const requireSessionActor = (ctx: TMintSessionDTO["ctx"]) => {
    if (ctx.actor !== ActorType.USER && ctx.actor !== ActorType.IDENTITY) {
      throw new BadRequestError({ message: "Only a user or machine identity can hold an Agent Vault session" });
    }
    return { type: ctx.actor, id: ctx.actorId };
  };

  const toSessionView = ({
    userId,
    identityId,
    onBehalfOfUserId,
    onBehalfOfUserName,
    ...session
  }: TAgentVaultSessionListRow) => ({
    ...session,
    status: deriveSessionStatus({ ...session, userId, identityId, onBehalfOfUserId, onBehalfOfUserName })
  });

  // Rows written by one statement share a createdAt, so each gets its own, one millisecond apart, to keep the
  // order the keys were sent in.
  const insertSessionMetadata = async (
    { orgId, sessionId, metadata }: { orgId: string; sessionId: string; metadata: TAgentVaultSessionMetadata },
    tx: Knex
  ) => {
    const now = Date.now();
    const rows = Object.entries(metadata).map(([key, value], index) => ({
      key,
      value,
      orgId,
      agentVaultSessionId: sessionId,
      createdAt: new Date(now + index)
    }));
    await resourceMetadataDAL.insertMany(rows, tx);
  };

  const findSessionMetadata = async (sessionIds: string[], tx?: Knex) => {
    const entriesBySession = new Map<string, [string, string][]>();
    if (!sessionIds.length) return new Map<string, TAgentVaultSessionMetadata>();
    const rows = await resourceMetadataDAL.find(
      { $in: { agentVaultSessionId: sessionIds } },
      {
        sort: [
          ["createdAt", "asc"],
          ["id", "asc"]
        ],
        tx
      }
    );
    rows.forEach((row) => {
      const entries = entriesBySession.get(row.agentVaultSessionId!);
      if (entries) entries.push([row.key, row.value ?? ""]);
      else entriesBySession.set(row.agentVaultSessionId!, [[row.key, row.value ?? ""]]);
    });
    return new Map(
      [...entriesBySession].map(([sessionId, entries]): [string, TAgentVaultSessionMetadata] => [
        sessionId,
        Object.fromEntries(entries)
      ])
    );
  };

  // A deleted variable is left out, and its service then names none.
  const findInlineOauthVariableKeys = async (
    rows: { projectId: string; credentialType: string; credentialConfig?: unknown }[]
  ): Promise<TInlineOauthVariableKeys> => {
    const variableIds = inlineOauthVariableIdsOf(rows);
    if (!variableIds.length) return new Map();
    const variables = await agentVaultVariableDAL.findOauthForResolve({ variableIds, projectId: rows[0].projectId });
    return new Map(variables.map((variable) => [variable.id, { id: variable.id, key: variable.key }]));
  };

  const findInlineHookNames = async (
    rows: { projectId: string; hookId?: string | null }[]
  ): Promise<ReadonlyMap<string, string>> => {
    const hookIds = rows.flatMap((row) => (row.hookId ? [row.hookId] : []));
    if (!hookIds.length) return new Map();
    return agentVaultHookDAL.findNamesByIds({ ids: hookIds, projectId: rows[0].projectId });
  };

  // Each session's services or skills, listed by name or sent inline, as one list in the order they were sent. A listed
  // one is read from the live catalog, so one the reader no longer reaches is left out, the same as a deleted one: its
  // later name, description and hosts are the catalog's to show, not the session's. The reach is read only when a
  // session lists something.
  const findSessionEntries = async <
    TInlineRow extends { sessionId: string; position: number },
    TListedRow extends { sessionId: string; position: number; id: string },
    TEntry
  >({
    sessionIds,
    loadInline,
    loadListed,
    loadReachableIds,
    fromInline,
    fromListed
  }: {
    sessionIds: string[];
    loadInline: (sessionIds: string[]) => Promise<TInlineRow[]>;
    loadListed: (sessionIds: string[]) => Promise<TListedRow[]>;
    loadReachableIds: () => Promise<string[] | null>;
    fromInline: (row: TInlineRow) => TEntry;
    fromListed: (row: TListedRow) => TEntry;
  }) => {
    const [inlineRows, allListedRows] = await Promise.all([loadInline(sessionIds), loadListed(sessionIds)]);
    const reachableIds = allListedRows.length ? await loadReachableIds() : null;
    const reachable = reachableIds === null ? null : new Set(reachableIds);
    const listedRows = reachable ? allListedRows.filter((row) => reachable.has(row.id)) : allListedRows;
    const bySession = new Map<string, { position: number; entry: TEntry }[]>();
    const add = (sessionId: string, position: number, entry: TEntry) => {
      bySession.set(sessionId, [...(bySession.get(sessionId) ?? []), { position, entry }]);
    };
    inlineRows.forEach((row) => add(row.sessionId, row.position, fromInline(row)));
    listedRows.forEach((row) => add(row.sessionId, row.position, fromListed(row)));
    return (sessionId: string) =>
      (bySession.get(sessionId) ?? []).sort((a, b) => a.position - b.position).map(({ entry }) => entry);
  };

  // An inline service's OAuth variable key is a variable read, as on a bundle's services.
  const findSessionServices = (
    sessionIds: string[],
    readerAccessBundleIds: string[] | null,
    permission: TAgentVaultPermission["permission"]
  ) => {
    const canReadVariables = permission.can(
      ProjectPermissionAgentVaultVariableActions.Read,
      ProjectPermissionSub.AgentVaultVariables
    );
    const canReadHooks = permission.can(
      ProjectPermissionAgentVaultHookActions.Read,
      ProjectPermissionSub.AgentVaultHooks
    );
    // Filled once the inline rows are loaded, which findSessionEntries awaits before it maps any of them.
    let oauthVariables: TInlineOauthVariableKeys = new Map();
    let hookNames: ReadonlyMap<string, string> | undefined;
    return findSessionEntries({
      sessionIds,
      loadInline: async (ids) => {
        const rows = await agentVaultSessionInlineServiceDAL.findSummariesBySessionIds(ids);
        [oauthVariables, hookNames] = await Promise.all([
          canReadVariables ? findInlineOauthVariableKeys(rows) : oauthVariables,
          canReadHooks ? findInlineHookNames(rows) : undefined
        ]);
        return rows;
      },
      loadListed: (ids) => agentVaultSessionServiceDAL.findSummariesBySessionIds(ids),
      loadReachableIds: () => serviceIdsReachedThrough(agentVaultServiceDAL, readerAccessBundleIds),
      fromInline: (row): TAgentVaultSessionServiceSummary => ({
        ...toInlineServiceSummary(row, oauthVariables, hookNames),
        isInline: true
      }),
      fromListed: ({ id, name, type, description, hostPattern }): TAgentVaultSessionServiceSummary => ({
        id,
        name,
        type,
        description,
        hostPattern: readHostPattern(type, hostPattern),
        isInline: false
      })
    });
  };

  const findSessionSkills = (sessionIds: string[], readerAccessBundleIds: string[] | null) =>
    findSessionEntries({
      sessionIds,
      loadInline: (ids) => agentVaultSessionInlineSkillDAL.findSummariesBySessionIds(ids),
      loadListed: (ids) => agentVaultSessionSkillDAL.findSummariesBySessionIds(ids),
      loadReachableIds: () => skillIdsReachedThrough(agentVaultSkillBundleDAL, readerAccessBundleIds),
      fromInline: (row): TAgentVaultSessionSkillSummary => toInlineSkillSummary(row),
      fromListed: ({ id, name, description }): TAgentVaultSessionSkillSummary => ({
        id,
        name,
        description,
        isInline: false
      })
    });

  const withSessionServicesAndSkills = async <T extends { id: string }>(
    sessions: T[],
    readerAccessBundleIds: string[] | null,
    permission: TAgentVaultPermission["permission"]
  ) => {
    const sessionIds = sessions.map((session) => session.id);
    const [servicesOf, skillsOf] = await Promise.all([
      findSessionServices(sessionIds, readerAccessBundleIds, permission),
      findSessionSkills(sessionIds, readerAccessBundleIds)
    ]);
    return sessions.map((session) => ({ ...session, services: servicesOf(session.id), skills: skillsOf(session.id) }));
  };

  const withServicesSkillsAndMetadata = async <T extends { id: string }>(
    sessions: T[],
    readerAccessBundleIds: string[] | null,
    permission: TAgentVaultPermission["permission"]
  ) => {
    const [withServices, metadataBySession] = await Promise.all([
      withSessionServicesAndSkills(sessions, readerAccessBundleIds, permission),
      findSessionMetadata(sessions.map((session) => session.id))
    ]);
    return withServices.map((session) => ({ ...session, metadata: metadataBySession.get(session.id) ?? {} }));
  };

  const resolveSessionTtl = (ttl: string | undefined, isOnBehalfOf: boolean) =>
    ttl ?? (isOnBehalfOf ? AGENT_VAULT_ON_BEHALF_OF_SESSION_DEFAULT_TTL : AGENT_VAULT_SESSION_DEFAULT_TTL);

  const mintSession = async ({
    projectId,
    ctx,
    accessBundle,
    services = [],
    skills = [],
    actorName,
    actorEmail,
    ttl: requestedTtl,
    onBehalfOf,
    label,
    metadata = {}
  }: TMintSessionDTO) => {
    const caller = requireSessionActor(ctx);
    // The rest of mint, the junction table and resolve all work on a list; a session holds at most one bundle.
    const accessBundles = accessBundle ? [accessBundle] : [];
    const ttl = resolveSessionTtl(requestedTtl, Boolean(onBehalfOf));

    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Create,
      ProjectPermissionSub.AgentVaultSessions
    );

    if (!accessBundles.length && !services.length && !skills.length) {
      throw new BadRequestError({
        message: "Set the access bundle this session should carry, or list the services or skills it should have."
      });
    }

    // A string is a service's name and an object is a service sent inline. Each keeps its place in the list: the
    // session reads its services back in that order, and an inline service's errors point at it.
    const serviceEntries = services.flatMap((entry, position) =>
      typeof entry === "string" ? [{ name: entry, position }] : []
    );
    const inlineEntries = services.flatMap((entry, position) =>
      typeof entry === "string" ? [] : [{ input: entry, position }]
    );

    // An inline service names its own hosts and credentials, the same call as writing a bundle's services.
    if (
      inlineEntries.length &&
      permission.cannot(
        ProjectPermissionAgentVaultSessionActions.CreateWithInlineServices,
        ProjectPermissionSub.AgentVaultSessions
      )
    ) {
      throw new ForbiddenRequestError({
        message: `You are not allowed to ${ProjectPermissionAgentVaultSessionActions.CreateWithInlineServices} on ${ProjectPermissionSub.AgentVaultSessions}. Use an access bundle or list the project's services by name instead.`
      });
    }

    // Skills the same way, with positions of their own.
    const skillEntries = skills.flatMap((entry, position) =>
      typeof entry === "string" ? [{ name: entry, position }] : []
    );
    const inlineSkillEntries = skills.flatMap((entry, position) =>
      typeof entry === "string" ? [] : [{ input: entry, position }]
    );
    if (
      inlineSkillEntries.length &&
      permission.cannot(
        ProjectPermissionAgentVaultSessionActions.CreateWithInlineSkills,
        ProjectPermissionSub.AgentVaultSessions
      )
    ) {
      throw new ForbiddenRequestError({
        message: `You are not allowed to ${ProjectPermissionAgentVaultSessionActions.CreateWithInlineSkills} on ${ProjectPermissionSub.AgentVaultSessions}. Use an access bundle or list the project's skills by name instead.`
      });
    }

    let preparedInlineServices = prepareInlineServices(
      inlineEntries.map(({ input }) => input),
      inlineEntries.map(({ position }) => position)
    );
    // An OAuth variable's tokens go to the hosts this session's service names, as a typed {{KEY}} would send a value, so
    // naming one takes ReadValue too, checked before the lookup so a missing key can't be told from one the caller may
    // not read.
    if (preparedInlineServices.some((service) => service.oauthVariableKey)) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAgentVaultVariableActions.ReadValue,
        ProjectPermissionSub.AgentVaultVariables
      );
      preparedInlineServices = bindInlineOauthVariables(
        preparedInlineServices,
        await agentVaultVariableDAL.findKeys({ projectId, owner: null })
      );
    }
    // Naming a saved hook takes reading hooks, and the plan's hooks feature, as setting one on a project service does.
    const inlineHookNames = [
      ...new Set(preparedInlineServices.flatMap((service) => (service.hook ? [service.hook.name] : [])))
    ];
    if (inlineHookNames.length) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAgentVaultHookActions.Read,
        ProjectPermissionSub.AgentVaultHooks
      );
      await assertAgentVaultHooksOnPlan(licenseService, ctx.actorOrgId);
    }
    const canReadHooks = permission.can(
      ProjectPermissionAgentVaultHookActions.Read,
      ProjectPermissionSub.AgentVaultHooks
    );
    const preparedInlineSkills = prepareInlineSkills(
      inlineSkillEntries.map(({ input }) => input),
      inlineSkillEntries.map(({ position }) => position)
    );

    const bundles = accessBundles.length
      ? await agentVaultAccessBundleDAL.find({ projectId, $in: { name: accessBundles } })
      : [];
    const bundlesByName = new Map(bundles.map((bundle) => [bundle.name, bundle]));
    // An unknown name reads like an ungranted one, so the error never confirms that a bundle exists.
    const firstUnreachable = (reachable: string[] | null) =>
      accessBundles.find((name) => {
        const bundle = bundlesByName.get(name);
        return !bundle || (reachable !== null && !reachable.includes(bundle.id));
      });

    const listedServices = serviceEntries.length
      ? await agentVaultServiceDAL.findCatalogByNames({ projectId, names: serviceEntries.map(({ name }) => name) })
      : [];
    const servicesByName = new Map(listedServices.map((service) => [service.name, service]));
    // A service is listed through the bundles it is in, the same reach a session's bundle needs. An unknown name reads
    // like one out of reach, so the error never confirms that a service exists.
    const firstUnreachableService = async (reachableBundleIds: string[] | null) => {
      if (!serviceEntries.length) return undefined;
      const reachableIds = await serviceIdsReachedThrough(agentVaultServiceDAL, reachableBundleIds);
      const reachable = reachableIds === null ? null : new Set(reachableIds);
      return serviceEntries.find(({ name }) => {
        const service = servicesByName.get(name);
        return !service || (reachable !== null && !reachable.has(service.id));
      })?.name;
    };

    const listedSkills = skillEntries.length
      ? await agentVaultSkillDAL.findByNamesInProject({ projectId, names: skillEntries.map(({ name }) => name) })
      : [];
    const skillsByName = new Map(listedSkills.map((skill) => [skill.name, skill]));
    // The same reach as a listed service.
    const firstUnreachableSkill = async (reachableBundleIds: string[] | null) => {
      if (!skillEntries.length) return undefined;
      const reachableIds = await skillIdsReachedThrough(agentVaultSkillBundleDAL, reachableBundleIds);
      const reachable = reachableIds === null ? null : new Set(reachableIds);
      return skillEntries.find(({ name }) => {
        const skill = skillsByName.get(name);
        return !skill || (reachable !== null && !reachable.has(skill.id));
      })?.name;
    };

    let onBehalfOfUser: Awaited<ReturnType<typeof resolveOnBehalfOfUser>> | null = null;
    // The bundles resolve will reach for this session's owner: the caller's, or on a user's behalf the ones both reach.
    let ownerReach: string[] | null;
    if (onBehalfOf) {
      // A session on a user's behalf can use only the bundles both the user and the identity reach. The delegation is
      // checked first and the identity's own bundles next, so an identity learns nothing about who is in the org until
      // an admin has delegated it and granted it the bundle it asks for.
      const delegation = await findCallerDelegation({ agentVaultDelegationDAL }, { projectId, ctx });
      const { accessBundleIds: identityReach } = await getAgentVaultReachability(
        { permissionService, membershipDAL },
        { projectId, ctx }
      );
      const notGrantedToIdentity = firstUnreachable(identityReach);
      if (notGrantedToIdentity) {
        throw new BadRequestError({
          name: "AccessBundleNotGranted",
          message: `No access bundle named '${notGrantedToIdentity}' is granted to this machine identity. A session on behalf of a user can use only bundles granted to both the user and the machine identity, so check the name, or ask an Agent Vault admin to grant the bundle to the machine identity.`
        });
      }
      const serviceOutOfIdentityReach = await firstUnreachableService(identityReach);
      if (serviceOutOfIdentityReach) {
        throw new BadRequestError({
          name: "ServiceNotGranted",
          message: `This machine identity can't use a service called '${serviceOutOfIdentityReach}'. A session on behalf of a user can use only services in an access bundle granted to both the user and the machine identity, so check the name, or ask an Agent Vault admin to grant the machine identity a bundle that holds it.`
        });
      }
      const skillOutOfIdentityReach = await firstUnreachableSkill(identityReach);
      if (skillOutOfIdentityReach) {
        throw new BadRequestError({
          name: "SkillNotGranted",
          message: `This machine identity can't use a skill called '${skillOutOfIdentityReach}'. A session on behalf of a user can use only skills in an access bundle granted to both the user and the machine identity, so check the name, or ask an Agent Vault admin to grant the machine identity a bundle that holds it.`
        });
      }
      // A request with only inline skills names nothing the checks above refuse, so without this an identity granted no
      // bundle would reach the user lookup, whose answers tell who is in the org. The lists hold back the same way.
      if (identityReach?.length === 0) {
        throw new BadRequestError({
          name: "AccessBundleNotGranted",
          message:
            "No access bundle in this project is granted to this machine identity. A session on behalf of a user needs at least one, even when it sends its own services or skills, so ask an Agent Vault admin to grant the machine identity a bundle."
        });
      }

      onBehalfOfUser = await resolveOnBehalfOfUser(
        { agentVaultDelegationDAL, userDAL, orgDAL, permissionService, membershipDAL },
        { projectId, ctx, onBehalfOf, delegation }
      );
      // getProjectPermission leaves the last actor it ran for in the request context, where the audit log reads the
      // caller's permission metadata. Running the caller's check again, memoized so it costs no query, puts it back.
      await getAgentVaultPermission({ permissionService }, { projectId, ctx });

      const notGrantedToUser = firstUnreachable(onBehalfOfUser.accessBundleIds);
      if (notGrantedToUser) {
        throw new BadRequestError({
          name: "AccessBundleNotGranted",
          message: `No access bundle named '${notGrantedToUser}' is granted to '${onBehalfOfUser.identifier}'. Check the name, or ask an Agent Vault admin to grant it to them.`
        });
      }
      const serviceOutOfUserReach = await firstUnreachableService(onBehalfOfUser.accessBundleIds);
      if (serviceOutOfUserReach) {
        throw new BadRequestError({
          name: "ServiceNotGranted",
          message: `'${onBehalfOfUser.identifier}' can't use a service called '${serviceOutOfUserReach}'. Check the name, or ask an Agent Vault admin to grant them an access bundle that holds it.`
        });
      }
      const skillOutOfUserReach = await firstUnreachableSkill(onBehalfOfUser.accessBundleIds);
      if (skillOutOfUserReach) {
        throw new BadRequestError({
          name: "SkillNotGranted",
          message: `'${onBehalfOfUser.identifier}' can't use a skill called '${skillOutOfUserReach}'. Check the name, or ask an Agent Vault admin to grant them an access bundle that holds it.`
        });
      }
      // Resolve reaches only the bundles both of them are granted, so a service each reaches through a different bundle
      // would never arrive. The skills fetch reaches the same bundles.
      ownerReach = intersectAccessBundleIds(identityReach, onBehalfOfUser.accessBundleIds);
      const serviceOutOfSharedReach = await firstUnreachableService(ownerReach);
      if (serviceOutOfSharedReach) {
        throw new BadRequestError({
          name: "ServiceNotGranted",
          message: `The service '${serviceOutOfSharedReach}' isn't in an access bundle granted to both this machine identity and '${onBehalfOfUser.identifier}'. A session on behalf of a user can use only services in an access bundle granted to both.`
        });
      }
      const skillOutOfSharedReach = await firstUnreachableSkill(ownerReach);
      if (skillOutOfSharedReach) {
        throw new BadRequestError({
          name: "SkillNotGranted",
          message: `The skill '${skillOutOfSharedReach}' isn't in an access bundle granted to both this machine identity and '${onBehalfOfUser.identifier}'. A session on behalf of a user can use only skills in an access bundle granted to both.`
        });
      }
    } else {
      const { accessBundleIds } = await getAgentVaultReachability(
        { permissionService, membershipDAL },
        { projectId, ctx }
      );
      ownerReach = accessBundleIds;
      const notGranted = firstUnreachable(accessBundleIds);
      if (notGranted) {
        throw new BadRequestError({
          name: "AccessBundleNotGranted",
          message: `No access bundle named '${notGranted}' is granted to you. Check the name, or ask an Agent Vault admin to grant it.`
        });
      }
      const serviceOutOfReach = await firstUnreachableService(accessBundleIds);
      if (serviceOutOfReach) {
        throw new BadRequestError({
          name: "ServiceNotGranted",
          message: `You can't use a service called '${serviceOutOfReach}'. Check the name, or ask an Agent Vault admin to grant you an access bundle that holds it.`
        });
      }
      const skillOutOfReach = await firstUnreachableSkill(accessBundleIds);
      if (skillOutOfReach) {
        throw new BadRequestError({
          name: "SkillNotGranted",
          message: `You can't use a skill called '${skillOutOfReach}'. Check the name, or ask an Agent Vault admin to grant you an access bundle that holds it.`
        });
      }
    }

    // A skill sent with the session that has the name of one in its bundle is refused, as an inline service is: each skill
    // installs as a folder of its name, so the agent could have only one, and quietly dropping the bundle's would hide that
    // from whoever put it there. One that joins the bundle later loses to the bundle's at fetch.
    if (preparedInlineSkills.length && accessBundles.length) {
      const sentNames = new Set(preparedInlineSkills.map((skill) => skill.name));
      for (const name of accessBundles) {
        const bundle = bundlesByName.get(name)!;
        // eslint-disable-next-line no-await-in-loop
        const clash = (await agentVaultSkillBundleDAL.findSkillsForBundle(bundle.id)).find((skill) =>
          sentNames.has(skill.name)
        );
        if (clash) {
          throw new BadRequestError({
            name: "SkillConflict",
            message: `The skill '${clash.name}' you sent has the same name as one in the access bundle '${bundle.name}', and an agent can install only one skill by a name. Give the one you send another name in its SKILL.md.`
          });
        }
      }
    }

    // Two services for one host would leave the proxy to guess which credential a request means. A service the session
    // names that its bundle also holds is the same service, and resolve sends it once. A fast failure off the replica,
    // like the inline check below: the check that counts runs again in the transaction, under the lock that adding a
    // service to a bundle and changing a service's hosts take.
    const orderedServices = serviceEntries.map(({ name, position }) => ({
      service: servicesByName.get(name)!,
      position
    }));
    const assertNoServiceHostConflicts = async (tx?: Knex) => {
      if (!orderedServices.length) return;
      const current = tx
        ? await agentVaultServiceDAL.find({ $in: { id: orderedServices.map(({ service }) => service.id) } }, { tx })
        : [];
      const freshServices = orderedServices.map(({ service }) => {
        if (!tx) return service;
        const fresh = current.find((currentService) => currentService.id === service.id);
        // Deleted since the catalog read, so it reads like any name the caller can't use.
        if (!fresh) {
          throw new BadRequestError({
            name: "ServiceNotGranted",
            message: `You can't use a service called '${service.name}'. Check the name, or ask an Agent Vault admin to grant you an access bundle that holds it.`
          });
        }
        return { ...service, hostPattern: fresh.hostPattern ?? null };
      });
      const sessionServices = (
        await Promise.all(
          accessBundles.map((name) => agentVaultServiceDAL.findByAccessBundleId(bundlesByName.get(name)!.id, tx))
        )
      ).flat();
      const throughBundleIds = new Set(sessionServices.map(({ id }) => id));
      freshServices.forEach((service) => {
        const [conflict] = findHostPatternConflicts(
          service.hostPattern ?? null,
          sessionServices.filter((other) => other.id !== service.id)
        );
        if (conflict) {
          throw new BadRequestError({
            name: "ServiceHostConflict",
            message: `The services '${service.name}' and '${conflict.serviceName}' both cover ${conflict.patterns.join(", ")}, so one session can't carry both. Leave one of them out.`
          });
        }
        sessionServices.push(service);
      });
      assertNoServiceConflicts(preparedInlineServices, freshServices);
      // Resolve lets an override win over an inline service of its name, so one that takes the name is refused here
      // rather than left out of the session without a word. A listed service that the session's bundle also holds is sent as
      // the bundle's, whose services the bundle check below covers.
      if (preparedInlineServices.length && ownerReach !== null) {
        const overrides = await agentVaultResolveDAL.findServiceOverrides(
          {
            projectId,
            accessBundleIds: ownerReach,
            services: freshServices
              .filter(({ id }) => !throughBundleIds.has(id))
              .map(({ id, hostPattern }) => ({ id, hostPattern: hostPattern ?? null }))
          },
          tx
        );
        assertNoOverrideConflicts(preparedInlineServices, overrides);
      }
    };
    await assertNoServiceHostConflicts();

    // A fast failure only: the check that counts runs again in the transaction, under the lock renames take.
    const assertNoBundleConflicts = async (tx?: Knex) => {
      if (!preparedInlineServices.length) return;
      for (const name of accessBundles) {
        const bundle = bundlesByName.get(name)!;
        // eslint-disable-next-line no-await-in-loop
        const bundleServices = await agentVaultServiceDAL.findByAccessBundleId(bundle.id, tx);
        assertNoAccessBundleConflicts(preparedInlineServices, { name: bundle.name, services: bundleServices });
      }
    };
    await assertNoBundleConflicts();

    // Sealed before the transaction: with an external KMS this is a network call, and the transaction stays short.
    // Each value is sealed on its own, the way a project's services keep them, so the two can share one table. An
    // inline skill's files are sealed whole, the way a project skill's versions are.
    let encrypt: ((plainText: Buffer) => Buffer) | null = null;
    if (preparedInlineServices.some((service) => service.secrets) || preparedInlineSkills.length) {
      const { encryptor } = await kmsDataKeyService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      encrypt = (plainText) => encryptor({ plainText }).cipherTextBlob;
    }
    const seal = (value: unknown) => encrypt!(Buffer.from(JSON.stringify(value)));
    const inlineServiceRows: TAgentVaultInlineServiceInsert[] = preparedInlineServices.map(
      ({ secrets, customHeaders, substitutions, oauthVariableKey, hook, ...service }) => ({
        ...service,
        projectId,
        credentialType: service.credentialConfig.type,
        encryptedCredential: secrets?.credential ? seal(secrets.credential) : null,
        customHeaders: customHeaders.map((header, index) => ({
          ...header,
          encryptedValue: seal({ value: secrets!.customHeaders[index] })
        })),
        substitutions: substitutions.map((substitution, index) => ({
          ...substitution,
          encryptedValue: seal({ value: secrets!.substitutions[index] })
        }))
      })
    );
    const inlineSkillRows: TAgentVaultInlineSkillInsert[] = preparedInlineSkills.map((skill) => ({
      projectId,
      position: skill.position,
      name: skill.name,
      description: skill.description,
      encryptedFiles: encrypt!(skill.serialized),
      sha256: skill.sha256,
      sizeBytes: skill.sizeBytes,
      fileCount: skill.fileCount
    }));
    const orderedSkills = skillEntries.map(({ name, position }) => ({
      skill: skillsByName.get(name)!,
      position
    }));

    const ttlMs = ttl === AGENT_VAULT_SESSION_TTL_NEVER ? null : ms(ttl);
    const expiresAt = ttlMs === null ? null : new Date(Date.now() + ttlMs);
    const { token, tokenHash } = generateSessionToken();

    const sessionId = crypto.nativeCrypto.randomUUID();
    const encryptedSessionLogKey = await wrapSessionLogKey(
      { projectId, sessionId, sessionLogKey: generateSessionLogKey() },
      kmsDataKeyService
    );

    // A session on a user's behalf belongs to the identity, so only it and admins see the session and its logs. The
    // user is kept alongside: resolve uses their personal values and intersects their reach with the identity's.
    const owner = {
      userId: caller.type === ActorType.USER ? caller.id : null,
      identityId: caller.type === ActorType.IDENTITY ? caller.id : null,
      actorType: caller.type === ActorType.IDENTITY ? AgentVaultMemberType.MachineIdentity : AgentVaultMemberType.User,
      actorName,
      actorEmail,
      ...(onBehalfOfUser && {
        onBehalfOfUserId: onBehalfOfUser.user.id,
        onBehalfOfUserName:
          `${onBehalfOfUser.user.firstName ?? ""} ${onBehalfOfUser.user.lastName ?? ""}`.trim() ||
          (onBehalfOfUser.user.email ?? onBehalfOfUser.user.username),
        onBehalfOfUserEmail: onBehalfOfUser.user.email ?? null
      })
    };

    const { session, insertedInlineServices, insertedInlineSkills, inlineHookNamesById } =
      await agentVaultSessionDAL.transaction(async (tx) => {
        if ((preparedInlineServices.length && accessBundles.length) || orderedServices.length) {
          await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.AgentVaultServiceNames(projectId)]);
          await assertNoBundleConflicts(tx);
          await assertNoServiceHostConflicts(tx);
        }
        const created = await agentVaultSessionDAL.createWithId(
          {
            id: sessionId,
            projectId,
            ...owner,
            label: label || null,
            tokenHash,
            expiresAt,
            encryptedSessionLogKey
          },
          tx
        );

        await agentVaultSessionAccessBundleDAL.insertMany(
          accessBundles.map((name, position) => ({
            sessionId: created.id,
            accessBundleId: bundlesByName.get(name)!.id,
            accessBundleName: name,
            position
          })),
          tx
        );

        if (orderedServices.length) {
          await agentVaultSessionServiceDAL.insertMany(
            orderedServices.map(({ service, position }) => ({
              sessionId: created.id,
              serviceId: service.id,
              position
            })),
            tx
          );
        }

        // Read in this transaction, so a hook deleted since the request arrived is a 404 rather than a failed key.
        const savedHooks = inlineHookNames.length
          ? await agentVaultHookDAL.findByNamesForService({ names: inlineHookNames, projectId }, tx)
          : [];
        const hooksByName = new Map(savedHooks.map((hook) => [hook.name.toLowerCase(), hook]));
        const inserted = await agentVaultSessionInlineServiceDAL.insertForSession(
          {
            sessionId: created.id,
            services: inlineServiceRows.map((row, index) => {
              const { hook } = preparedInlineServices[index];
              if (!hook) return { ...row, ...NO_SERVICE_HOOK };
              const saved = hooksByName.get(hook.name);
              if (!saved) throw hookNotFoundByName(hook.name);
              return { ...row, ...toServiceHookColumns(saved.id, hook) };
            })
          },
          tx
        );

        if (orderedSkills.length) {
          // Read again in the transaction, as listed services are: a skill deleted since the read above would otherwise
          // fail the insert on its foreign key as a 500.
          const current = new Set(
            (
              await agentVaultSkillDAL.findByNamesInProject(
                { projectId, names: orderedSkills.map(({ skill }) => skill.name) },
                tx
              )
            ).map((skill) => skill.id)
          );
          const gone = orderedSkills.find(({ skill }) => !current.has(skill.id));
          if (gone) {
            throw new BadRequestError({
              name: "SkillNotGranted",
              message: `You can't use a skill called '${gone.skill.name}'. Check the name, or ask an Agent Vault admin to grant you an access bundle that holds it.`
            });
          }
          try {
            await agentVaultSessionSkillDAL.insertMany(
              orderedSkills.map(({ skill, position }) => ({ sessionId: created.id, skillId: skill.id, position })),
              tx
            );
          } catch (error) {
            if (isForeignKeyViolation(error)) {
              throw new BadRequestError({
                name: "SkillNotGranted",
                message:
                  "A skill listed for this session was deleted while the session was being created. Create it again without that skill."
              });
            }
            throw error;
          }
        }
        const insertedSkills = await agentVaultSessionInlineSkillDAL.insertForSession(
          { sessionId: created.id, skills: inlineSkillRows },
          tx
        );

        await insertSessionMetadata({ orgId: ctx.actorOrgId, sessionId: created.id, metadata }, tx);

        return {
          session: created,
          insertedInlineServices: inserted,
          insertedInlineSkills: insertedSkills,
          inlineHookNamesById: new Map(savedHooks.map((hook) => [hook.id, hook.name]))
        };
      });
    const oauthVariables = await findInlineOauthVariableKeys(insertedInlineServices);

    return {
      session: {
        id: session.id,
        label: session.label ?? null,
        metadata,
        expiresAt: session.expiresAt ?? null,
        createdAt: session.createdAt,
        accessBundle: accessBundle ? { id: bundlesByName.get(accessBundle)!.id, name: accessBundle } : null,
        services: [
          ...orderedServices.map(({ service, position }) => ({
            position,
            service: {
              id: service.id,
              name: service.name,
              type: service.type as AgentVaultServiceType,
              description: service.description ?? null,
              hostPattern: readHostPattern(service.type as AgentVaultServiceType, service.hostPattern),
              isInline: false as const
            }
          })),
          ...insertedInlineServices.map((row) => ({
            position: row.position,
            service: {
              ...toInlineServiceSummary(row, oauthVariables, canReadHooks ? inlineHookNamesById : undefined),
              isInline: true as const
            }
          }))
        ]
          .sort((a, b) => a.position - b.position)
          .map(({ service }): TAgentVaultSessionServiceSummary => service),
        skills: [
          ...orderedSkills.map(({ skill, position }) => ({
            position,
            skill: { id: skill.id, name: skill.name, description: skill.description, isInline: false as const }
          })),
          ...insertedInlineSkills.map((row) => ({ position: row.position, skill: toInlineSkillSummary(row) }))
        ]
          .sort((a, b) => a.position - b.position)
          .map(({ skill }): TAgentVaultSessionSkillSummary => skill)
      },
      token,
      ttlSeconds: ttlMs === null ? null : Math.floor(ttlMs / 1000),
      onBehalfOf: onBehalfOfUser
        ? { userId: onBehalfOfUser.user.id, username: onBehalfOfUser.user.username, email: onBehalfOfUser.user.email }
        : null
    };
  };

  const listSessions = async ({
    projectId,
    ctx,
    scope,
    statuses,
    search,
    metadataFilter,
    limit,
    offset
  }: TListSessionsDTO) => {
    const { permission, accessBundleIds } = await getAgentVaultReachability(
      { permissionService, membershipDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionSub.AgentVaultSessions
    );

    if (scope === AgentVaultSessionScope.All) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAgentVaultSessionActions.ReadAny,
        ProjectPermissionSub.AgentVaultSessions
      );
    }

    const actor = scope === AgentVaultSessionScope.All ? undefined : requireSessionActor(ctx);
    const { sessions, totalCount } = await agentVaultSessionDAL.findForList({
      projectId,
      actor,
      statuses,
      search,
      metadataFilter,
      limit,
      offset
    });

    return {
      sessions: await withServicesSkillsAndMetadata(sessions.map(toSessionView), accessBundleIds, permission),
      totalCount
    };
  };

  // A session you may not see reads exactly like one that does not exist.
  const findVisibleSession = async ({
    projectId,
    ctx,
    sessionId,
    reachesAnySession
  }: TGetSessionByIdDTO & { reachesAnySession: boolean }) => {
    const {
      sessions: [session]
    } = await agentVaultSessionDAL.findForList({
      projectId,
      sessionId,
      actor: reachesAnySession ? undefined : requireSessionActor(ctx),
      limit: 1,
      offset: 0
    });
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });
    return session;
  };

  const getSessionById = async ({ projectId, ctx, sessionId }: TGetSessionByIdDTO) => {
    const { permission, accessBundleIds } = await getAgentVaultReachability(
      { permissionService, membershipDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionSub.AgentVaultSessions
    );
    const reachesAnySession = permission.can(
      ProjectPermissionAgentVaultSessionActions.ReadAny,
      ProjectPermissionSub.AgentVaultSessions
    );

    const [session] = await withServicesSkillsAndMetadata(
      [toSessionView(await findVisibleSession({ projectId, ctx, sessionId, reachesAnySession }))],
      accessBundleIds,
      permission
    );
    return { session };
  };

  const revokeSession = async ({ projectId, ctx, sessionId }: TRevokeSessionDTO) => {
    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Revoke,
      ProjectPermissionSub.AgentVaultSessions
    );
    const reachesAnySession = permission.can(
      ProjectPermissionAgentVaultSessionActions.RevokeAny,
      ProjectPermissionSub.AgentVaultSessions
    );

    const session = await findVisibleSession({ projectId, ctx, sessionId, reachesAnySession });

    const metadata = (await findSessionMetadata([session.id])).get(session.id) ?? {};

    // revokedNow lets the caller audit a real revocation without auditing a repeat. Revoking twice stays a
    // 200 with the original revokedAt, so the second caller is not the one who revoked it.
    if (session.revokedAt) return { session: { ...toSessionView(session), metadata }, revokedNow: false };

    // The timestamp comes from the written row: a read-back could land on a replica that has not seen it.
    const revoked = await agentVaultSessionDAL.transaction(async (tx) => {
      const row = await agentVaultSessionDAL.revokeIfActive(session.id, new Date(), tx);
      // Revoked by this call or found already over, the session can't use its inline services' secrets or its inline
      // skills' files again.
      await agentVaultSessionInlineServiceDAL.deleteSecretsBySessionId(session.id, tx);
      await agentVaultSessionInlineSkillDAL.deleteFilesBySessionId(session.id, tx);
      return row;
    });
    if (revoked) {
      return {
        session: { ...toSessionView({ ...session, revokedAt: revoked.revokedAt ?? null }), metadata },
        revokedNow: true
      };
    }

    // Nothing was written: a concurrent revoke won, or the owner or the user it acts for was deleted, which already
    // reads as revoked and is left untouched. Report the row as it is now, which the read above may not have seen.
    const current = await agentVaultSessionDAL.findByIdOnPrimary(session.id, projectId);
    return {
      session: {
        ...toSessionView(
          current
            ? {
                ...session,
                revokedAt: current.revokedAt ?? null,
                userId: current.userId ?? null,
                identityId: current.identityId ?? null,
                onBehalfOfUserId: current.onBehalfOfUserId ?? null,
                onBehalfOf: session.onBehalfOf && { ...session.onBehalfOf, id: current.onBehalfOfUserId ?? null }
              }
            : session
        ),
        metadata
      },
      revokedNow: false
    };
  };

  const updateSession = async ({ projectId, ctx, sessionId, label, metadata }: TUpdateSessionDTO) => {
    const { permission, accessBundleIds } = await getAgentVaultReachability(
      { permissionService, membershipDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Edit,
      ProjectPermissionSub.AgentVaultSessions
    );
    const reachesAnySession = permission.can(
      ProjectPermissionAgentVaultSessionActions.EditAny,
      ProjectPermissionSub.AgentVaultSessions
    );

    const session = await findVisibleSession({ projectId, ctx, sessionId, reachesAnySession });
    // The visible session can come from a replica that lags, so the owner check, the previous label and the previous
    // metadata come from the write itself, which holds the session's row lock until the metadata is written too.
    type TEditResult = {
      written: { previousLabel: string | null; isEditable: boolean } | undefined;
      metadataChanged: boolean;
      currentMetadata: TAgentVaultSessionMetadata;
    };
    const result = await agentVaultSessionDAL.transaction(async (tx): Promise<TEditResult> => {
      let written: TEditResult["written"];
      if (label === undefined) {
        written = await agentVaultSessionDAL.lockForEdit(session.id, projectId, tx);
      } else {
        const row = await agentVaultSessionDAL.updateLabel(session.id, projectId, label, tx);
        written = row && { previousLabel: row.previousLabel, isEditable: row.isUpdated };
      }
      if (!written?.isEditable) return { written, metadataChanged: false, currentMetadata: {} };

      const previousMetadata = (await findSessionMetadata([session.id], tx)).get(session.id) ?? {};
      if (!metadata || isSameSessionMetadata(previousMetadata, metadata)) {
        return { written, metadataChanged: false, currentMetadata: previousMetadata };
      }
      await resourceMetadataDAL.delete({ agentVaultSessionId: session.id }, tx);
      await insertSessionMetadata({ orgId: ctx.actorOrgId, sessionId: session.id, metadata }, tx);
      return { written, metadataChanged: true, currentMetadata: metadata };
    });

    if (!result.written) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });
    if (!result.written.isEditable) {
      throw new BadRequestError({
        message:
          "The user or machine identity that owned this session, or the user it was started on behalf of, was deleted, so its label and metadata can't be changed."
      });
    }

    const { previousLabel } = result.written;
    const currentLabel = label === undefined ? previousLabel : label;
    const [view] = await withSessionServicesAndSkills(
      [toSessionView({ ...session, label: currentLabel })],
      accessBundleIds,
      permission
    );
    return {
      session: { ...view, metadata: result.currentMetadata },
      previousLabel,
      isChanged: currentLabel !== previousLabel || result.metadataChanged
    };
  };

  return {
    mintSession,
    listSessions,
    getSessionById,
    revokeSession,
    updateSession
  };
};
