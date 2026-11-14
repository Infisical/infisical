import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import { TAgentVaultServiceDALFactory } from "../agent-vault-access-bundle/agent-vault-service-dal";
import { TAgentVaultDelegationDALFactory } from "../agent-vault-delegation/agent-vault-delegation-dal";
import { findCallerDelegation, resolveOnBehalfOfUser } from "../agent-vault-delegation/agent-vault-on-behalf-of-fns";
import { generateSessionLogKey, wrapSessionLogKey } from "../agent-vault-session-log/agent-vault-session-log-secrets";
import { findHostPatternConflicts } from "../agent-vault/agent-vault-conflict-fns";
import { AgentVaultMemberType, AgentVaultServiceType, AgentVaultSessionScope } from "../agent-vault/agent-vault-enums";
import { assertAgentVaultHooksOnPlan } from "../agent-vault/agent-vault-hook-fns";
import {
  getAgentVaultPermission,
  getAgentVaultReachability,
  intersectAccessBundleIds,
  serviceIdsReachedThrough
} from "../agent-vault/agent-vault-permission";
import { TAgentVaultSessionAccessBundleDALFactory } from "./agent-vault-session-access-bundle-dal";
import { TAgentVaultSessionDALFactory, TAgentVaultSessionListRow } from "./agent-vault-session-dal";
import { deriveSessionStatus, generateSessionToken } from "./agent-vault-session-fns";
import {
  TAgentVaultInlineServiceInsert,
  TAgentVaultSessionInlineServiceDALFactory
} from "./agent-vault-session-inline-service-dal";
import {
  assertNoAccessBundleConflicts,
  assertNoNamedServiceConflicts,
  prepareInlineServices,
  toInlineServiceSummary
} from "./agent-vault-session-inline-service-fns";
import { TAgentVaultSessionServiceDALFactory } from "./agent-vault-session-service-dal";
import {
  TAgentVaultSessionServiceSummary,
  TGetSessionByIdDTO,
  TListSessionsDTO,
  TMintSessionDTO,
  TRevokeSessionDTO,
  TUpdateSessionLabelDTO
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
  agentVaultSessionAccessBundleDAL: TAgentVaultSessionAccessBundleDALFactory;
  agentVaultSessionInlineServiceDAL: Pick<
    TAgentVaultSessionInlineServiceDALFactory,
    "insertForSession" | "findSummariesBySessionIds" | "deleteSecretsBySessionId"
  >;
  agentVaultSessionServiceDAL: Pick<TAgentVaultSessionServiceDALFactory, "insertMany" | "findSummariesBySessionIds">;
  agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "find">;
  agentVaultServiceDAL: Pick<
    TAgentVaultServiceDALFactory,
    "find" | "findByAccessBundleId" | "findCatalogByNames" | "findIdsInBundles"
  >;
  agentVaultDelegationDAL: Pick<TAgentVaultDelegationDALFactory, "findForIdentity" | "coversUser">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  userDAL: Pick<TUserDALFactory, "findOne">;
  orgDAL: Pick<TOrgDALFactory, "findEffectiveOrgMembership">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "wrapKey" | "createCipherPairWithDataKey">;
  licenseService: Pick<TLicenseService, "getPlan">;
};

export type TAgentVaultSessionServiceFactory = ReturnType<typeof agentVaultSessionServiceFactory>;

const namedServiceHostPattern = (type: AgentVaultServiceType, hostPattern?: string | null) =>
  type === AgentVaultServiceType.Http || type === AgentVaultServiceType.Mcp ? (hostPattern ?? null) : null;

export const agentVaultSessionServiceFactory = ({
  agentVaultSessionDAL,
  agentVaultSessionAccessBundleDAL,
  agentVaultSessionInlineServiceDAL,
  agentVaultSessionServiceDAL,
  agentVaultAccessBundleDAL,
  agentVaultServiceDAL,
  agentVaultDelegationDAL,
  membershipDAL,
  userDAL,
  orgDAL,
  permissionService,
  kmsService,
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

  // The services each session names and the ones sent with it, as one list in the order they were sent.
  const withSessionServices = async <T extends { id: string }>(sessions: T[]) => {
    const sessionIds = sessions.map((session) => session.id);
    const [inlineRows, namedRows] = await Promise.all([
      agentVaultSessionInlineServiceDAL.findSummariesBySessionIds(sessionIds),
      agentVaultSessionServiceDAL.findSummariesBySessionIds(sessionIds)
    ]);
    const bySession = new Map<string, { position: number; service: TAgentVaultSessionServiceSummary }[]>();
    const add = (sessionId: string, position: number, service: TAgentVaultSessionServiceSummary) => {
      bySession.set(sessionId, [...(bySession.get(sessionId) ?? []), { position, service }]);
    };
    inlineRows.forEach((row) => add(row.sessionId, row.position, { ...toInlineServiceSummary(row), isInline: true }));
    namedRows.forEach(({ sessionId, position, id, name, type, description, hostPattern }) =>
      add(sessionId, position, {
        id,
        name,
        type,
        description,
        hostPattern: namedServiceHostPattern(type, hostPattern),
        isInline: false
      })
    );
    return sessions.map((session) => ({
      ...session,
      services: (bySession.get(session.id) ?? []).sort((a, b) => a.position - b.position).map(({ service }) => service)
    }));
  };

  const resolveSessionTtl = (ttl: string | undefined, isOnBehalfOf: boolean) =>
    ttl ?? (isOnBehalfOf ? AGENT_VAULT_ON_BEHALF_OF_SESSION_DEFAULT_TTL : AGENT_VAULT_SESSION_DEFAULT_TTL);

  const mintSession = async ({
    projectId,
    ctx,
    accessBundle,
    services = [],
    actorName,
    actorEmail,
    ttl: requestedTtl,
    onBehalfOf,
    label
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

    if (!accessBundles.length && !services.length) {
      throw new BadRequestError({
        message: "Name the access bundle this session should carry, or the services it should reach."
      });
    }

    // A string names a project service and an object is a service sent inline. Each keeps its place in the list: the
    // session reads its services back in that order, and an inline service's errors point at it.
    const namedEntries = services.flatMap((entry, position) =>
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
        message:
          "Only an Agent Vault admin can send inline services with a session. Name an access bundle or the project's services instead."
      });
    }

    const preparedInlineServices = prepareInlineServices(
      inlineEntries.map(({ input }) => input),
      inlineEntries.map(({ position }) => position)
    );
    if (preparedInlineServices.some((service) => service.hookUrl)) {
      await assertAgentVaultHooksOnPlan(licenseService, ctx.actorOrgId);
    }

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

    const namedServices = namedEntries.length
      ? await agentVaultServiceDAL.findCatalogByNames({ projectId, names: namedEntries.map(({ name }) => name) })
      : [];
    const namedByName = new Map(namedServices.map((service) => [service.name, service]));
    // A service is named through the bundles it is in, the same reach a session's bundle needs. An unknown name reads
    // like one out of reach, so the error never confirms that a service exists.
    const firstUnreachableService = async (reachableBundleIds: string[] | null) => {
      if (!namedEntries.length) return undefined;
      const reachableIds = await serviceIdsReachedThrough(agentVaultServiceDAL, reachableBundleIds);
      const reachable = reachableIds === null ? null : new Set(reachableIds);
      return namedEntries.find(({ name }) => {
        const service = namedByName.get(name);
        return !service || (reachable !== null && !reachable.has(service.id));
      })?.name;
    };

    let onBehalfOfUser: Awaited<ReturnType<typeof resolveOnBehalfOfUser>> | null = null;
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
          message: `This machine identity can't name a service called '${serviceOutOfIdentityReach}'. A session on behalf of a user can name only services in an access bundle granted to both the user and the machine identity, so check the name, or ask an Agent Vault admin to grant the machine identity a bundle that holds it.`
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
      // Resolve reaches only the bundles both of them are granted, so a service each reaches through a different bundle
      // would never arrive.
      const serviceOutOfSharedReach = await firstUnreachableService(
        intersectAccessBundleIds(identityReach, onBehalfOfUser.accessBundleIds)
      );
      if (serviceOutOfSharedReach) {
        throw new BadRequestError({
          name: "ServiceNotGranted",
          message: `The service '${serviceOutOfSharedReach}' isn't in an access bundle granted to both this machine identity and '${onBehalfOfUser.identifier}'. A session on behalf of a user can name only services in an access bundle granted to both.`
        });
      }
    } else {
      const { accessBundleIds } = await getAgentVaultReachability(
        { permissionService, membershipDAL },
        { projectId, ctx }
      );
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
          message: `You can't name a service called '${serviceOutOfReach}'. Check the name, or ask an Agent Vault admin to grant you an access bundle that holds it.`
        });
      }
    }

    // Two services for one host would leave the proxy to guess which credential a request means. A service the session
    // names that its bundle also holds is the same service, and resolve sends it once. A fast failure off the replica,
    // like the inline check below: the check that counts runs again in the transaction, under the lock that adding a
    // service to a bundle and changing a service's hosts take.
    const orderedNamed = namedEntries.map(({ name, position }) => ({ service: namedByName.get(name)!, position }));
    const assertNoNamedServiceHostConflicts = async (tx?: Knex) => {
      if (!orderedNamed.length) return;
      const current = tx
        ? await agentVaultServiceDAL.find({ $in: { id: orderedNamed.map(({ service }) => service.id) } }, { tx })
        : [];
      const named = orderedNamed.map(({ service }) => {
        const fresh = current.find((currentService) => currentService.id === service.id);
        return fresh ? { ...service, hostPattern: fresh.hostPattern ?? null } : service;
      });
      const sessionServices = (
        await Promise.all(
          accessBundles.map((name) => agentVaultServiceDAL.findByAccessBundleId(bundlesByName.get(name)!.id, tx))
        )
      ).flat();
      named.forEach((service) => {
        const [conflict] = findHostPatternConflicts(
          service.hostPattern ?? null,
          sessionServices.filter((other) => other.id !== service.id)
        );
        if (conflict) {
          throw new BadRequestError({
            message: `The services '${service.name}' and '${conflict.serviceName}' both cover ${conflict.patterns.join(", ")}, so one session can't carry both. Leave one of them out.`
          });
        }
        sessionServices.push(service);
      });
      assertNoNamedServiceConflicts(preparedInlineServices, named);
    };
    await assertNoNamedServiceHostConflicts();

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
    // Each value is sealed on its own, the way a project's services keep them, so the two can share one table.
    let seal: ((value: unknown) => Buffer) | null = null;
    if (preparedInlineServices.some((service) => service.secrets)) {
      const { encryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      seal = (value) => encryptor({ plainText: Buffer.from(JSON.stringify(value)) }).cipherTextBlob;
    }
    const inlineServiceRows: TAgentVaultInlineServiceInsert[] = preparedInlineServices.map(
      ({ secrets, customHeaders, substitutions, ...service }) => ({
        ...service,
        projectId,
        credentialType: service.credentialConfig.type,
        encryptedCredential: secrets?.credential ? seal!(secrets.credential) : null,
        encryptedHookSecret: secrets?.hookSecret ? seal!({ value: secrets.hookSecret }) : null,
        customHeaders: customHeaders.map((header, index) => ({
          ...header,
          encryptedValue: seal!({ value: secrets!.customHeaders[index] })
        })),
        substitutions: substitutions.map((substitution, index) => ({
          ...substitution,
          encryptedValue: seal!({ value: secrets!.substitutions[index] })
        }))
      })
    );

    const ttlMs = ttl === AGENT_VAULT_SESSION_TTL_NEVER ? null : ms(ttl);
    const expiresAt = ttlMs === null ? null : new Date(Date.now() + ttlMs);
    const { token, tokenHash } = generateSessionToken();

    const sessionId = crypto.nativeCrypto.randomUUID();
    const encryptedSessionLogKey = await wrapSessionLogKey(
      { projectId, sessionId, sessionLogKey: generateSessionLogKey() },
      kmsService
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

    const { session, insertedInlineServices } = await agentVaultSessionDAL.transaction(async (tx) => {
      if ((preparedInlineServices.length && accessBundles.length) || orderedNamed.length) {
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.AgentVaultServiceNames(projectId)]);
        await assertNoBundleConflicts(tx);
        await assertNoNamedServiceHostConflicts(tx);
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

      if (orderedNamed.length) {
        await agentVaultSessionServiceDAL.insertMany(
          orderedNamed.map(({ service, position }) => ({ sessionId: created.id, serviceId: service.id, position })),
          tx
        );
      }

      const inserted = await agentVaultSessionInlineServiceDAL.insertForSession(
        { sessionId: created.id, services: inlineServiceRows },
        tx
      );

      return { session: created, insertedInlineServices: inserted };
    });

    return {
      session: {
        id: session.id,
        label: session.label ?? null,
        expiresAt: session.expiresAt ?? null,
        createdAt: session.createdAt,
        accessBundle: accessBundle ? { id: bundlesByName.get(accessBundle)!.id, name: accessBundle } : null,
        services: [
          ...orderedNamed.map(({ service, position }) => ({
            position,
            service: {
              id: service.id,
              name: service.name,
              type: service.type as AgentVaultServiceType,
              description: service.description ?? null,
              hostPattern: namedServiceHostPattern(service.type as AgentVaultServiceType, service.hostPattern),
              isInline: false as const
            }
          })),
          ...insertedInlineServices.map((row) => ({
            position: row.position,
            service: { ...toInlineServiceSummary(row), isInline: true as const }
          }))
        ]
          .sort((a, b) => a.position - b.position)
          .map(({ service }): TAgentVaultSessionServiceSummary => service)
      },
      token,
      ttlSeconds: ttlMs === null ? null : Math.floor(ttlMs / 1000),
      onBehalfOf: onBehalfOfUser
        ? { userId: onBehalfOfUser.user.id, username: onBehalfOfUser.user.username, email: onBehalfOfUser.user.email }
        : null
    };
  };

  const listSessions = async ({ projectId, ctx, scope, statuses, search, limit, offset }: TListSessionsDTO) => {
    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionSub.AgentVaultSessions
    );

    if (
      scope === AgentVaultSessionScope.All &&
      permission.cannot(ProjectPermissionAgentVaultSessionActions.ReadAny, ProjectPermissionSub.AgentVaultSessions)
    ) {
      throw new ForbiddenRequestError({ message: "Only an Agent Vault administrator can list everyone's sessions" });
    }

    const actor = scope === AgentVaultSessionScope.All ? undefined : requireSessionActor(ctx);
    const { sessions, totalCount } = await agentVaultSessionDAL.findForList({
      projectId,
      actor,
      statuses,
      search,
      limit,
      offset
    });

    return { sessions: await withSessionServices(sessions.map(toSessionView)), totalCount };
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
    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionSub.AgentVaultSessions
    );
    const reachesAnySession = permission.can(
      ProjectPermissionAgentVaultSessionActions.ReadAny,
      ProjectPermissionSub.AgentVaultSessions
    );

    const [session] = await withSessionServices([
      toSessionView(await findVisibleSession({ projectId, ctx, sessionId, reachesAnySession }))
    ]);
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

    // revokedNow lets the caller audit a real revocation without auditing a repeat. Revoking twice stays a
    // 200 with the original revokedAt, so the second caller is not the one who revoked it.
    if (session.revokedAt) return { session: toSessionView(session), revokedNow: false };

    // The timestamp comes from the written row: a read-back could land on a replica that has not seen it.
    const revoked = await agentVaultSessionDAL.transaction(async (tx) => {
      const row = await agentVaultSessionDAL.revokeIfActive(session.id, new Date(), tx);
      // Revoked by this call or found already over, the session can't use its inline services' secrets again.
      await agentVaultSessionInlineServiceDAL.deleteSecretsBySessionId(session.id, tx);
      return row;
    });
    if (revoked) {
      return { session: toSessionView({ ...session, revokedAt: revoked.revokedAt ?? null }), revokedNow: true };
    }

    // Nothing was written: a concurrent revoke won, or the owner or the user it acts for was deleted, which already
    // reads as revoked and is left untouched. Report the row as it is now, which the read above may not have seen.
    const current = await agentVaultSessionDAL.findByIdOnPrimary(session.id, projectId);
    return {
      session: toSessionView(
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
      revokedNow: false
    };
  };

  const updateSessionLabel = async ({ projectId, ctx, sessionId, label }: TUpdateSessionLabelDTO) => {
    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Edit,
      ProjectPermissionSub.AgentVaultSessions
    );
    const reachesAnySession = permission.can(
      ProjectPermissionAgentVaultSessionActions.EditAny,
      ProjectPermissionSub.AgentVaultSessions
    );

    const session = await findVisibleSession({ projectId, ctx, sessionId, reachesAnySession });
    // The visible session can come from a replica that lags, so the owner check and the previous label come from
    // the write itself.
    const updated = await agentVaultSessionDAL.updateLabel(session.id, projectId, label);
    if (!updated) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });
    if (!updated.isUpdated) {
      throw new BadRequestError({
        message:
          "The user or machine identity that owned this session, or the user it was started on behalf of, was deleted, so its label can't be changed."
      });
    }

    const [view] = await withSessionServices([toSessionView({ ...session, label })]);
    return { session: view, previousLabel: updated.previousLabel };
  };

  return {
    mintSession,
    listSessions,
    getSessionById,
    revokeSession,
    updateSessionLabel
  };
};
