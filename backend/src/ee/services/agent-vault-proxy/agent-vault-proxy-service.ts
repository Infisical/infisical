import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, ProjectMembershipRole, TAgentVaultProxies } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { AgentVaultCredentialType, AgentVaultUnmatchedHost } from "../agent-vault/agent-vault-enums";
import { getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultAccessBundleMemberDALFactory } from "../agent-vault-member/agent-vault-access-bundle-member-dal";
import { TAgentVaultSessionDALFactory } from "../agent-vault-session/agent-vault-session-dal";
import { hashResolvedConnectionIds, hashSessionToken } from "../agent-vault-session/agent-vault-session-fns";
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
  TResolvedConnection,
  TResolveSessionDTO,
  TUpdateProxyDTO
} from "./agent-vault-proxy-types";
import { TAgentVaultResolveDALFactory } from "./agent-vault-resolve-dal";

export const AGENT_VAULT_PROXY_ENROLLMENT_TOKEN_PREFIX = "avp_";

// Health is derived, not stored: a proxy is healthy while its last heartbeat is inside three poll
// intervals. Do not add an isHealthy column — there are already three divergent client-side staleness
// rules in this codebase and a fourth would be worse.
const HEARTBEAT_MISSES_BEFORE_UNHEALTHY = 3;

type TAgentVaultProxyServiceFactoryDep = {
  agentVaultProxyDAL: TAgentVaultProxyDALFactory;
  agentVaultResolveDAL: TAgentVaultResolveDALFactory;
  agentVaultSessionDAL: Pick<TAgentVaultSessionDALFactory, "findByTokenHash" | "updateById">;
  agentVaultAccessBundleMemberDAL: Pick<TAgentVaultAccessBundleMemberDALFactory, "findReachableAccessBundleIds">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  resourceAuthMethodService: Pick<TResourceAuthMethodServiceFactory, "initAtCreate" | "mintToken" | "loginWithToken">;
};

export type TAgentVaultProxyServiceFactory = ReturnType<typeof agentVaultProxyServiceFactory>;

export const agentVaultProxyServiceFactory = ({
  agentVaultProxyDAL,
  agentVaultResolveDAL,
  agentVaultSessionDAL,
  agentVaultAccessBundleMemberDAL,
  permissionService,
  kmsService,
  resourceAuthMethodService
}: TAgentVaultProxyServiceFactoryDep) => {
  const isHealthy = (proxy: Pick<TAgentVaultProxies, "heartbeat" | "pollInterval">) => {
    if (!proxy.heartbeat) return false;
    return proxy.heartbeat.getTime() > Date.now() - proxy.pollInterval * HEARTBEAT_MISSES_BEFORE_UNHEALTHY * 1000;
  };

  const toConfig = (proxy: TAgentVaultProxies): TAgentVaultProxyConfig => ({
    unmatchedHost: proxy.unmatchedHost as AgentVaultUnmatchedHost,
    bypassHosts: proxy.bypassHosts ?? null,
    pollInterval: proxy.pollInterval
  });

  // A member sees enough to pin a fingerprint and to tell whether the proxy is up. bypassHosts and
  // unmatchedHost describe the deployment, not the session, so they stay administrator-only.
  const toMemberView = (proxy: TAgentVaultProxies) => ({
    id: proxy.id,
    name: proxy.name,
    heartbeat: proxy.heartbeat ?? null,
    isHealthy: isHealthy(proxy),
    version: proxy.version ?? null,
    rootCaFingerprint: proxy.rootCaFingerprint ?? null,
    rootCaExpiresAt: proxy.rootCaExpiresAt ?? null
  });

  const toAdminView = (proxy: TAgentVaultProxies) => ({
    ...toMemberView(proxy),
    ...toConfig(proxy),
    createdAt: proxy.createdAt
  });

  const $authorize = async ({ projectId, ctx }: TListProxiesDTO, action: ProjectPermissionAgentVaultProxyActions) => {
    const { permission, isAdmin } = await getAgentVaultReachability(
      { permissionService, agentVaultAccessBundleMemberDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.AgentVaultProxies);
    return { isAdmin };
  };

  const $findProxyOr404 = async ({ projectId, proxyId }: { projectId: string; proxyId: string }) => {
    const proxy = await agentVaultProxyDAL.findByIdInProject({ id: proxyId, projectId });
    if (!proxy) throw new NotFoundError({ message: `Proxy with ID '${proxyId}' not found` });
    return proxy;
  };

  /** Read by the auth plugin's tokenVersion check on every proxy request. */
  const getProxyForAuth = (proxyId: string) => agentVaultProxyDAL.findByIdWithOrg(proxyId);

  // Role-projected rather than role-gated: the Proxies page is where a member finds a fingerprint to pin.
  const listProxies = async (dto: TListProxiesDTO) => {
    const { isAdmin } = await $authorize(dto, ProjectPermissionAgentVaultProxyActions.Read);
    const proxies = await agentVaultProxyDAL.findForProject(dto.projectId);
    return proxies.map((proxy) => (isAdmin ? toAdminView(proxy) : toMemberView(proxy)));
  };

  const $issueEnrollmentToken = async (proxyId: string, ctx: TCreateProxyDTO["ctx"]) => {
    const enrollment = await resourceAuthMethodService.mintToken({
      resource: { type: RESOURCE_TYPE_AGENT_VAULT_PROXY, id: proxyId },
      actor: {
        type: ctx.actor,
        id: ctx.actorId,
        orgId: ctx.actorOrgId,
        rootOrgId: ctx.actorOrgId,
        parentOrgId: ctx.actorOrgId,
        authMethod: ctx.actorAuthMethod
      }
    });
    return { token: enrollment.token, expiresAt: enrollment.expiresAt };
  };

  const createProxy = async ({ projectId, ctx, name, ...settings }: TCreateProxyDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Create);

    const existing = await agentVaultProxyDAL.findOne({ projectId, name });
    if (existing) throw new BadRequestError({ message: `A proxy named '${name}' already exists` });

    const proxy = await agentVaultProxyDAL.transaction(async (tx) => {
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

    // Outside the transaction: minting hits KMS, and nothing slow or external belongs between BEGIN and
    // COMMIT.
    const enrollment = await $issueEnrollmentToken(proxy.id, ctx);
    return { proxy: toAdminView(proxy), enrollment };
  };

  // Does NOT bump tokenVersion, so a running proxy keeps serving until the replacement enrolls.
  const reissueEnrollmentToken = async ({ projectId, ctx, proxyId }: TProxyByIdDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Edit);
    const proxy = await $findProxyOr404({ projectId, proxyId });
    const enrollment = await $issueEnrollmentToken(proxy.id, ctx);
    return { proxy: toAdminView(proxy), enrollment };
  };

  const updateProxy = async ({ projectId, ctx, proxyId, name, ...settings }: TUpdateProxyDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Edit);
    const proxy = await $findProxyOr404({ projectId, proxyId });

    if (name && name !== proxy.name) {
      const existing = await agentVaultProxyDAL.findOne({ projectId, name });
      if (existing) throw new BadRequestError({ message: `A proxy named '${name}' already exists` });
    }

    const updated = await agentVaultProxyDAL.updateById(proxy.id, { name, ...settings });
    return toAdminView(updated);
  };

  const deleteProxy = async ({ projectId, ctx, proxyId }: TProxyByIdDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Delete);
    const proxy = await $findProxyOr404({ projectId, proxyId });
    await agentVaultProxyDAL.deleteById(proxy.id);
    return { id: proxy.id, name: proxy.name };
  };

  // The kill switch. tokenVersion is what the auth plugin checks on every proxy request, so bumping it
  // stops the proxy at its next call rather than at its next restart.
  const revokeProxyAccess = async ({ projectId, ctx, proxyId }: TProxyByIdDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Revoke);
    const proxy = await $findProxyOr404({ projectId, proxyId });
    const updated = await agentVaultProxyDAL.updateById(proxy.id, {
      $incr: { tokenVersion: 1 },
      heartbeat: null
    });
    return toAdminView(updated);
  };

  // Readable by any Agent Vault project member: a public certificate is public, and this backs the
  // dashboard download and out-of-band setup. The CLI fetches the CA from the proxy itself, not here.
  const getRootCa = async ({ projectId, ctx, proxyId }: TProxyByIdDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Read);
    const proxy = await $findProxyOr404({ projectId, proxyId });

    if (!proxy.rootCaCertificate) {
      throw new NotFoundError({
        message: `Proxy '${proxy.name}' has not enrolled yet, so it has no certificate authority to download.`
      });
    }

    // All three columns are written together at enrollment and are immutable for the row's life, so a
    // present certificate implies a present fingerprint and expiry.
    return {
      proxyId: proxy.id,
      name: proxy.name,
      certificate: proxy.rootCaCertificate,
      fingerprint: proxy.rootCaFingerprint ?? null,
      expiresAt: proxy.rootCaExpiresAt ?? null
    };
  };

  const enroll = async ({ enrollmentToken, rootCaCertificate }: TEnrollProxyDTO) => {
    // Validate the PEM BEFORE the login: loginWithToken deletes the enrollment token in-transaction, so
    // a certificate checked afterwards would burn the operator's one-time token on a 400.
    const parsed = parseRootCaCertificate(rootCaCertificate);

    const login = await resourceAuthMethodService.loginWithToken({
      token: enrollmentToken,
      expectedResourceType: RESOURCE_TYPE_AGENT_VAULT_PROXY
    });

    const before = await agentVaultProxyDAL.findByIdWithOrg(login.resourceId);
    const proxy = await agentVaultProxyDAL.updateById(login.resourceId, {
      rootCaCertificate: parsed.certificate,
      rootCaFingerprint: parsed.fingerprint,
      rootCaExpiresAt: parsed.expiresAt
    });

    return {
      proxyId: proxy.id,
      name: proxy.name,
      // The enroll route is unauthenticated (the enrollment token is the credential, once), so it has no
      // req.permission to audit against and takes the scope from here instead.
      orgId: login.orgId,
      projectId: proxy.projectId,
      accessToken: login.accessToken,
      config: toConfig(proxy),
      rootCaFingerprint: parsed.fingerprint,
      replacedExistingCa: Boolean(before?.rootCaCertificate)
    };
  };

  // The full settings block comes back every time, unconditionally: three fields on a call the proxy
  // already makes, so there is nothing worth saving by diffing or versioning.
  const heartbeat = async ({ proxyId, version }: THeartbeatDTO) => {
    const proxy = await agentVaultProxyDAL.updateById(proxyId, { heartbeat: new Date(), version: version ?? null });
    return { config: toConfig(proxy) };
  };

  const $decryptCredential = (
    row: { credentialType: string; credentialConfig: unknown; encryptedCredential: Buffer | null },
    decryptor: (input: { cipherTextBlob: Buffer }) => Buffer
  ): TResolvedConnection["credential"] => {
    const config = (row.credentialConfig ?? {}) as Record<string, string>;
    if (row.credentialType === AgentVaultCredentialType.Passthrough || !row.encryptedCredential) {
      return { type: "passthrough" };
    }

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
    return { type: "basic", username: config.username, password: secret.password };
  };

  /**
   * The only endpoint that ever decrypts a credential.
   *
   * Two values reach it and the distinction matters: the proxy's JWT is the credential and does the
   * authorizing; the session token is a **selector**, because one proxy serves many sessions and only we
   * know which bundles each carries.
   */
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

    const actor = session.userId
      ? { type: ActorType.USER as const, id: session.userId }
      : { type: ActorType.IDENTITY as const, id: session.identityId! };

    // The role is re-derived here, never trusted from mint: an admin who minted over every bundle and is
    // then demoted must lose everything they were not explicitly granted.
    //
    // actorAuthMethod is passed as null *explicitly*. validateOrgSSO throws the moment it sees
    // `undefined` but passes cleanly on `null`, and the session row stores no auth method — so leaving
    // the field off 401s every user-minted session in an SSO-enforced org, and only in such an org, so
    // it would pass local testing.
    const { hasRole } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: session.projectId,
      actorAuthMethod: null,
      actorOrgId: orgId,
      actionProjectType: ActionProjectType.AgentVault
    });

    const rows = await agentVaultResolveDAL.findResolvableConnections({
      sessionId: session.id,
      projectId: session.projectId,
      actor,
      isAdmin: hasRole(ProjectMembershipRole.Admin)
    });

    // One cipher pair per resolve, not one per credential: this query runs once per active session per
    // poll interval and the pair costs three DB reads at org scope.
    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: session.projectId
    });

    const connections: TResolvedConnection[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      accessBundleName: row.accessBundleName,
      hostPattern: row.hostPattern,
      credential: $decryptCredential(row, decryptor)
    }));

    // The audit hint, and the one deliberate exception to "a read path never writes": written only when
    // the returned set differs from last time, so the steady-state poll writes nothing.
    const resolvedHash = hashResolvedConnectionIds(connections.map((connection) => connection.id));
    const isFirstResolve = !session.lastResolvedHash;
    const hasChanged = session.lastResolvedHash !== resolvedHash;
    if (hasChanged) {
      await agentVaultSessionDAL.updateById(session.id, { lastResolvedHash: resolvedHash });
    } else {
      logger.info(
        `agentVaultResolve: steady-state resolve [sessionId=${session.id}] [proxyId=${proxyId}] [connections=${connections.length}]`
      );
    }

    return {
      sessionId: session.id,
      expiresAt: session.expiresAt ?? null,
      connections,
      audit: hasChanged ? { isFirstResolve, connectionCount: connections.length } : null
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
    getRootCa,
    enroll,
    heartbeat,
    resolveSession
  };
};
