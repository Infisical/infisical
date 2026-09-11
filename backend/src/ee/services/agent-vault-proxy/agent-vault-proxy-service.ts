import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, OrgMembershipStatus, ProjectMembershipRole, TAgentVaultProxies } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  BadRequestError,
  ForbiddenRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError
} from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import { AgentVaultCredentialType, AgentVaultUnmatchedHost } from "../agent-vault/agent-vault-enums";
import { findReachableAccessBundleIds, liveGroupIdsFrom } from "../agent-vault/agent-vault-permission";
import { TAgentVaultSessionDALFactory } from "../agent-vault-session/agent-vault-session-dal";
import { hashSessionToken } from "../agent-vault-session/agent-vault-session-fns";
import { RESOURCE_TYPE_AGENT_VAULT_PROXY } from "../resource-auth-method/resource-auth-method-fns";
import { TResourceAuthMethodServiceFactory } from "../resource-auth-method/resource-auth-method-service";
import { parseRootCaCertificate } from "./agent-vault-ca-fns";
import { TAgentVaultProxyDALFactory } from "./agent-vault-proxy-dal";
import {
  TAgentVaultProxyConfig,
  TCreateProxyDTO,
  TEnrollProxyDTO,
  THeartbeatDTO,
  TListProxiesDTO,
  TProxyByIdDTO,
  TResolvedService,
  TResolveSessionDTO,
  TUpdateProxyDTO
} from "./agent-vault-proxy-types";
import { TAgentVaultResolveDALFactory } from "./agent-vault-resolve-dal";

// Health is derived from the last heartbeat and the poll interval, never stored.
const HEARTBEAT_MISSES_BEFORE_UNHEALTHY = 3;

type TAgentVaultProxyServiceFactoryDep = {
  agentVaultProxyDAL: TAgentVaultProxyDALFactory;
  agentVaultResolveDAL: TAgentVaultResolveDALFactory;
  agentVaultSessionDAL: Pick<TAgentVaultSessionDALFactory, "findByTokenHash">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  orgDAL: Pick<TOrgDALFactory, "findEffectiveOrgMembership">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  resourceAuthMethodService: Pick<
    TResourceAuthMethodServiceFactory,
    "initAtCreate" | "mintToken" | "loginWithToken" | "revokeAccess"
  >;
};

export type TAgentVaultProxyServiceFactory = ReturnType<typeof agentVaultProxyServiceFactory>;

export const agentVaultProxyServiceFactory = ({
  agentVaultProxyDAL,
  agentVaultResolveDAL,
  agentVaultSessionDAL,
  membershipDAL,
  orgDAL,
  permissionService,
  kmsService,
  resourceAuthMethodService
}: TAgentVaultProxyServiceFactoryDep) => {
  const isHealthy = (proxy: Pick<TAgentVaultProxies, "heartbeat" | "pollInterval" | "heartbeatTTL">) => {
    if (!proxy.heartbeat) return false;
    // Judged against the interval the proxy is running, not the one an admin may have just saved: it
    // only learns a new interval on its next poll, which is still scheduled at the old one. Lowering
    // the interval would otherwise report a live proxy as unreachable until that poll landed.
    const interval = proxy.heartbeatTTL ?? proxy.pollInterval;
    return proxy.heartbeat.getTime() > Date.now() - interval * HEARTBEAT_MISSES_BEFORE_UNHEALTHY * 1000;
  };

  const toConfig = (proxy: TAgentVaultProxies): TAgentVaultProxyConfig => ({
    unmatchedHost: proxy.unmatchedHost as AgentVaultUnmatchedHost,
    bypassHosts: proxy.bypassHosts ?? null,
    pollInterval: proxy.pollInterval
  });

  const toMemberView = (proxy: TAgentVaultProxies) => ({
    id: proxy.id,
    name: proxy.name,
    heartbeat: proxy.heartbeat ?? null,
    isHealthy: isHealthy(proxy),
    rootCaFingerprint: proxy.rootCaFingerprint ?? null,
    rootCaExpiresAt: proxy.rootCaExpiresAt ?? null
  });

  const toAdminView = (proxy: TAgentVaultProxies) => ({
    ...toMemberView(proxy),
    ...toConfig(proxy),
    createdAt: proxy.createdAt
  });

  const $authorize = async ({ projectId, ctx }: TListProxiesDTO, action: ProjectPermissionAgentVaultProxyActions) => {
    const { permission, hasRole } = await permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.AgentVault
    });
    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.AgentVaultProxies);
    return { isAdmin: hasRole(ProjectMembershipRole.Admin) };
  };

  const $findProxyOr404 = async ({ projectId, proxyId }: { projectId: string; proxyId: string }) => {
    const proxy = await agentVaultProxyDAL.findByIdInProject({ id: proxyId, projectId });
    if (!proxy) throw new NotFoundError({ message: `Proxy with ID '${proxyId}' not found` });
    return proxy;
  };

  const getProxyForAuth = (proxyId: string) => agentVaultProxyDAL.findByIdWithOrg(proxyId);

  const listProxies = async (dto: TListProxiesDTO) => {
    const { isAdmin } = await $authorize(dto, ProjectPermissionAgentVaultProxyActions.Read);
    const proxies = await agentVaultProxyDAL.findForProject(dto.projectId);
    return proxies.map((proxy) => (isAdmin ? toAdminView(proxy) : toMemberView(proxy)));
  };

  const $resourceActor = (ctx: TCreateProxyDTO["ctx"]) => ({
    type: ctx.actor,
    id: ctx.actorId,
    orgId: ctx.actorOrgId,
    rootOrgId: ctx.actorOrgId,
    parentOrgId: ctx.actorOrgId,
    authMethod: ctx.actorAuthMethod
  });

  // The first token belongs to creating the proxy; a replacement is its own permission, since enrolling
  // again rotates the CA and breaks every agent that trusted the old one.
  const $issueEnrollmentToken = async (proxyId: string, ctx: TCreateProxyDTO["ctx"], intent: "create" | "issue") => {
    const enrollment = await resourceAuthMethodService.mintToken({
      resource: { type: RESOURCE_TYPE_AGENT_VAULT_PROXY, id: proxyId },
      actor: $resourceActor(ctx),
      intent
    });
    return { token: enrollment.token, expiresAt: enrollment.expiresAt };
  };

  const createProxy = async ({ projectId, ctx, name, ...settings }: TCreateProxyDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Create);

    const existing = await agentVaultProxyDAL.findOne({ projectId, name });
    if (existing) throw new BadRequestError({ message: `A proxy named '${name}' already exists` });

    const create = () =>
      agentVaultProxyDAL.transaction(async (tx) => {
        const created = await agentVaultProxyDAL.create(
          {
            projectId,
            name,
            unmatchedHost: settings.unmatchedHost ?? AgentVaultUnmatchedHost.Allow,
            bypassHosts: settings.bypassHosts ?? null,
            pollInterval: settings.pollInterval ?? 60
          },
          tx
        );

        await resourceAuthMethodService.initAtCreate(
          { resource: { type: RESOURCE_TYPE_AGENT_VAULT_PROXY, id: created.id }, authMethod: { method: "token" } },
          tx
        );

        return created;
      });

    let proxy;
    try {
      proxy = await create();
    } catch (err) {
      if (isUniqueViolation(err)) throw new BadRequestError({ message: `A proxy named '${name}' already exists` });
      throw err;
    }

    // Outside the transaction: minting hits KMS.
    const enrollment = await $issueEnrollmentToken(proxy.id, ctx, "create");
    return { proxy: toAdminView(proxy), enrollment };
  };

  // Does NOT bump tokenVersion, so a running proxy keeps serving until the replacement enrolls.
  const reissueEnrollmentToken = async ({ projectId, ctx, proxyId }: TProxyByIdDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.IssueToken);
    const proxy = await $findProxyOr404({ projectId, proxyId });
    const enrollment = await $issueEnrollmentToken(proxy.id, ctx, "issue");
    return { proxy: toAdminView(proxy), enrollment };
  };

  const updateProxy = async ({ projectId, ctx, proxyId, name, ...settings }: TUpdateProxyDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Edit);
    const proxy = await $findProxyOr404({ projectId, proxyId });

    if (name && name !== proxy.name) {
      const existing = await agentVaultProxyDAL.findOne({ projectId, name });
      if (existing) throw new BadRequestError({ message: `A proxy named '${name}' already exists` });
    }

    try {
      const updated = await agentVaultProxyDAL.updateById(proxy.id, { name, ...settings });
      return toAdminView(updated);
    } catch (err) {
      if (isUniqueViolation(err)) throw new BadRequestError({ message: `A proxy named '${name}' already exists` });
      throw err;
    }
  };

  const deleteProxy = async ({ projectId, ctx, proxyId }: TProxyByIdDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Delete);
    const proxy = await $findProxyOr404({ projectId, proxyId });
    await agentVaultProxyDAL.deleteById(proxy.id);
    return { id: proxy.id, name: proxy.name };
  };

  // Through the shared revoke, which also deletes an enrollment token still waiting to be used; bumping
  // tokenVersion alone left it able to enroll.
  const revokeProxyAccess = async ({ projectId, ctx, proxyId }: TProxyByIdDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Revoke);
    const proxy = await $findProxyOr404({ projectId, proxyId });
    await resourceAuthMethodService.revokeAccess({
      resource: { type: RESOURCE_TYPE_AGENT_VAULT_PROXY, id: proxy.id },
      actor: $resourceActor(ctx)
    });
    return toAdminView({ ...proxy, heartbeat: null });
  };

  const enroll = async ({ enrollmentToken, rootCaCertificate }: TEnrollProxyDTO) => {
    // Validate the PEM before the login: loginWithToken consumes the enrollment token in-transaction.
    const parsed = parseRootCaCertificate(rootCaCertificate);

    const login = await resourceAuthMethodService.loginWithToken({
      token: enrollmentToken,
      expectedResourceType: RESOURCE_TYPE_AGENT_VAULT_PROXY
    });

    const before = await agentVaultProxyDAL.findByIdWithOrg(login.resourceId);
    const proxy = await agentVaultProxyDAL.updateById(login.resourceId, {
      rootCaFingerprint: parsed.fingerprint,
      rootCaExpiresAt: parsed.expiresAt
    });
    // updateById is typed non-nullable but returns nothing when the row is gone, which a delete during
    // the replica-lag window can produce. The CLI treats 401 as terminal and rides out a 5xx.
    if (!proxy) throw new UnauthorizedError({ message: "This proxy no longer exists" });

    return {
      proxyId: proxy.id,
      name: proxy.name,
      orgId: login.orgId,
      projectId: proxy.projectId,
      accessToken: login.accessToken,
      config: toConfig(proxy),
      rootCaFingerprint: parsed.fingerprint,
      replacedExistingCa: Boolean(before?.rootCaFingerprint)
    };
  };

  const heartbeat = async ({ proxyId }: THeartbeatDTO) => {
    const proxy = await agentVaultProxyDAL.recordHeartbeat(proxyId);
    if (!proxy) throw new UnauthorizedError({ message: "This proxy no longer exists" });
    return { config: toConfig(proxy) };
  };

  const $decryptCredential = (
    row: { credentialType: string; credentialConfig: unknown; encryptedCredential: Buffer | null },
    decryptor: ((input: { cipherTextBlob: Buffer }) => Buffer) | null
  ): TResolvedService["credential"] => {
    const config = (row.credentialConfig ?? {}) as Record<string, string>;
    if (row.credentialType === AgentVaultCredentialType.Passthrough || !row.encryptedCredential) {
      return { type: "passthrough" };
    }
    if (!decryptor) throw new InternalServerError({ message: "Failed to resolve the session's credentials" });

    const secret = JSON.parse(decryptor({ cipherTextBlob: row.encryptedCredential }).toString("utf-8")) as Record<
      string,
      string
    >;

    if (row.credentialType === AgentVaultCredentialType.Bearer) {
      return {
        type: "bearer",
        headerName: config.headerName,
        headerPrefix: config.headerPrefix,
        value: secret.value
      };
    }
    return { type: "basic", username: secret.username ?? "", password: secret.password ?? "" };
  };

  /** The only endpoint that decrypts a credential. The proxy's JWT authorizes; the session token is a selector. */
  const resolveSession = async ({ proxyId, orgId, sessionToken }: TResolveSessionDTO) => {
    const session = await agentVaultSessionDAL.findByTokenHash(hashSessionToken(sessionToken));
    if (!session) throw new NotFoundError({ message: "Session not found" });

    // A mismatch is 404, not 403, so a proxy cannot probe another tenant for session ids.
    const proxy = await agentVaultProxyDAL.findByIdWithOrg(proxyId);
    if (!proxy || proxy.projectId !== session.projectId || proxy.orgId !== orgId) {
      throw new NotFoundError({ message: "Session not found" });
    }

    if (session.revokedAt) throw new UnauthorizedError({ message: "Session revoked" });
    if (session.expiresAt && session.expiresAt <= new Date()) {
      throw new UnauthorizedError({ message: "Session expired" });
    }
    // The actor columns are SET NULL so the row outlives its owner for history. A null id must not reach the
    // lookups below: knex compiles `where col = null` to `IS NULL`, which matches every user row and made an
    // ownerless session resolve as an admin.
    if (!session.userId && !session.identityId) {
      throw new UnauthorizedError({ message: "The identity this session belonged to has been deleted" });
    }

    const actor = session.userId
      ? { type: ActorType.USER as const, id: session.userId }
      : { type: ActorType.IDENTITY as const, id: session.identityId! };

    // Deactivation writes isActive on the org-scope membership row, which getProjectPermission never reads.
    const orgMembership = await orgDAL.findEffectiveOrgMembership({
      actorType: actor.type,
      actorId: actor.id,
      orgId,
      status: OrgMembershipStatus.Accepted
    });
    if (!orgMembership?.isActive) {
      throw new UnauthorizedError({
        message: "The identity this session belongs to is no longer active in this organization"
      });
    }

    // The role is re-derived here, never trusted from mint, and it has to be a live role: a time-limited one
    // leaves its row behind when it lapses. actorAuthMethod is passed as null *explicitly* — validateOrgSSO
    // throws on `undefined` but passes on `null`, and the session row stores no auth method.
    let isAdmin: boolean;
    let liveGroupIds: string[];
    try {
      const { permission, hasRole, memberships } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorId: actor.id,
        projectId: session.projectId,
        actorAuthMethod: null,
        actorOrgId: orgId,
        actionProjectType: ActionProjectType.AgentVault
      });
      if (!permission.can(ProjectPermissionAgentVaultSessionActions.Read, ProjectPermissionSub.AgentVaultSessions)) {
        throw new UnauthorizedError({ message: "The role this session's actor held has expired" });
      }
      isAdmin = hasRole(ProjectMembershipRole.Admin);
      liveGroupIds = liveGroupIdsFrom(memberships);
    } catch (error) {
      // A 403 reads to the proxy as "Infisical is unreachable", which would keep a removed member's agent
      // running through its grace window.
      if (error instanceof ForbiddenRequestError && error.name === "ProjectMembershipNotFound") {
        throw new UnauthorizedError({ message: "The actor no longer has Agent Vault access" });
      }
      throw error;
    }

    const accessBundleIds = isAdmin
      ? null
      : await findReachableAccessBundleIds(membershipDAL, {
          projectId: session.projectId,
          actor,
          groupIds: liveGroupIds
        });

    const rows = await agentVaultResolveDAL.findResolvableServices({
      sessionId: session.id,
      projectId: session.projectId,
      accessBundleIds
    });

    // A bundle of pass-through services has nothing sealed, so deriving the project data key would be
    // a kms_keys read (or an external KMS round trip) per resolve for nothing.
    const decryptor = rows.some((row) => row.encryptedCredential)
      ? (
          await kmsService.createCipherPairWithDataKey({
            type: KmsDataKey.SecretManager,
            projectId: session.projectId
          })
        ).decryptor
      : null;

    const services: TResolvedService[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      accessBundleName: row.accessBundleName,
      hostPattern: row.hostPattern,
      credential: $decryptCredential(row, decryptor)
    }));

    logger.info(
      `agentVaultResolve: resolved [sessionId=${session.id}] [proxyId=${proxyId}] [services=${services.length}]`
    );

    return {
      sessionId: session.id,
      expiresAt: session.expiresAt ?? null,
      services
    };
  };

  return {
    getProxyForAuth,
    listProxies,
    createProxy,
    reissueEnrollmentToken,
    updateProxy,
    deleteProxy,
    revokeProxyAccess,
    enroll,
    heartbeat,
    resolveSession
  };
};
