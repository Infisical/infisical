import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { PersonalOverridesBehavior, SecretImportReferencesBehavior } from "@app/services/secret/secret-types";
import { TSecretV2BridgeServiceFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAgentProxyCaServiceFactory } from "../agent-proxy-ca/agent-proxy-ca-service";
import { TDynamicSecretLeaseQueueServiceFactory } from "../dynamic-secret-lease/dynamic-secret-lease-queue";
import { TDynamicSecretLeaseServiceFactory } from "../dynamic-secret-lease/dynamic-secret-lease-types";
import { TGatewayPoolServiceFactory } from "../gateway-pool/gateway-pool-service";
import { isGatewayHealthy } from "../gateway-v2/gateway-v2-fns";
import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { TGatewayCapabilities } from "../gateway-v2/gateway-v2-types";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionAgentGatewayActions, ProjectPermissionSub } from "../permission/project-permission";
import { TProxiedServiceCredentialDALFactory } from "../proxied-service/proxied-service-credential-dal";
import { ProxiedServiceCredentialRole } from "../proxied-service/proxied-service-enums";
import { TProxiedServiceServiceFactory } from "../proxied-service/proxied-service-service";
import { TAgentGatewayAccessServiceFactory } from "./agent-gateway-access-service";
import {
  BrokerUnavailableReason,
  fingerprintSecretRefs,
  TBrokerBundle,
  TBrokerCredential,
  TBrokerService
} from "./agent-gateway-broker-fns";
import { TAgentGatewayDALFactory } from "./agent-gateway-dal";
import { AgentGatewaySessionMode, AgentGatewaySessionStatus } from "./agent-gateway-enums";
import { TAgentGatewayServiceLinkDALFactory } from "./agent-gateway-service-link-dal";
import { TAgentGatewaySessionDALFactory } from "./agent-gateway-session-dal";
import { TAgentGatewaySessionLeaseDALFactory } from "./agent-gateway-session-lease-dal";
import { TAgentGatewaySessionRequestDALFactory } from "./agent-gateway-session-request-dal";

export type TAgentGatewaySessionServiceFactory = ReturnType<typeof agentGatewaySessionServiceFactory>;

type TAgentGatewaySessionServiceFactoryDep = {
  agentGatewayDAL: Pick<TAgentGatewayDALFactory, "findByIdWithTransport" | "stampLastUsed">;
  agentGatewayServiceLinkDAL: Pick<TAgentGatewayServiceLinkDALFactory, "findServicesByAgentGatewayIds">;
  agentGatewaySessionDAL: TAgentGatewaySessionDALFactory;
  agentGatewaySessionLeaseDAL: TAgentGatewaySessionLeaseDALFactory;
  agentGatewayAccessService: Pick<TAgentGatewayAccessServiceFactory, "assertActorMayUse">;
  proxiedServiceCredentialDAL: Pick<TProxiedServiceCredentialDALFactory, "findByServiceIds" | "findByIds">;
  proxiedServiceService: Pick<TProxiedServiceServiceFactory, "stampUsage">;
  agentGatewaySessionRequestDAL: Pick<
    TAgentGatewaySessionRequestDALFactory,
    "insertMany" | "findBySessionId" | "countBySessionId" | "countBySessionIds" | "countBrokeredBySessionIds"
  >;
  secretV2BridgeService: Pick<TSecretV2BridgeServiceFactory, "getSecrets">;
  dynamicSecretLeaseService: Pick<TDynamicSecretLeaseServiceFactory, "create">;
  dynamicSecretLeaseQueueService: Pick<
    TDynamicSecretLeaseQueueServiceFactory,
    "setLeaseRevocation" | "unsetLeaseRevocation"
  >;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  gatewayV2Service: Pick<
    TGatewayV2ServiceFactory,
    "getAgentGatewayConnectionDetails" | "signalAgentGatewaySessionCancellation"
  >;
  agentProxyCaService: Pick<TAgentProxyCaServiceFactory, "getRootCaCertificateForOrg">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

// A session is bounded so a stale grant cannot broker forever. The CLI renews at half-life, and renewal is
// where the access list is re-checked, so removing a principal takes effect within one renewal window.
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60;
export const SESSION_RENEW_AFTER_SECONDS = 30 * 60;
// Bounds how long a rotated secret, a revoked grant, or a disabled service can keep being applied.
export const BUNDLE_REFRESH_AFTER_SECONDS = 60;
// The certificate is the revocation clock for a running session: removing a principal from the access list
// stops the next renewal, so this is the worst case a revoked grant can keep working. Kept at ten minutes
// rather than one because each issuance is two RSA-2048 keygens plus a KMS decrypt, and the CLI renews at
// half-life, giving the same worst case as a five-minute certificate at half the cost.
export const CLIENT_CERT_TTL_SECONDS = 10 * 60;
// Leases are minted for the session's remaining life, never longer: a lease that outlives its session is a
// credential nobody is tracking.
const LEASE_TTL_CEILING_SECONDS = DEFAULT_SESSION_TTL_SECONDS;

type TSessionRow = Awaited<ReturnType<TAgentGatewaySessionDALFactory["findActiveById"]>>;

export const agentGatewaySessionServiceFactory = ({
  agentGatewayDAL,
  agentGatewayServiceLinkDAL,
  agentGatewaySessionDAL,
  agentGatewaySessionLeaseDAL,
  agentGatewayAccessService,
  proxiedServiceCredentialDAL,
  proxiedServiceService,
  agentGatewaySessionRequestDAL,
  secretV2BridgeService,
  dynamicSecretLeaseService,
  dynamicSecretLeaseQueueService,
  gatewayPoolService,
  gatewayV2Service,
  agentProxyCaService,
  kmsService,
  projectDAL,
  userDAL,
  identityDAL,
  permissionService,
  licenseService
}: TAgentGatewaySessionServiceFactoryDep) => {
  const $checkLicense = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.secretsBrokering) {
      throw new BadRequestError({
        message: "Failed to use secrets brokering due to plan restriction. Upgrade your plan to use agent gateways."
      });
    }
  };

  const $findAgentGateway = async (agentGatewayId: string) => {
    const agentGateway = await agentGatewayDAL.findByIdWithTransport(agentGatewayId);
    if (!agentGateway) {
      throw new NotFoundError({ message: `Agent Gateway with ID '${agentGatewayId}' not found` });
    }
    return agentGateway;
  };

  // Remote mode resolves each credential under whoever last saved its proxied service, so the value fetch
  // *is* the authorization check: a configurer who lost Read Value or left the org yields nothing and the
  // credential comes back unavailable. Local mode resolves under the caller, because `run` puts the broker
  // in the caller's own process where there is no boundary between them and the plaintext.
  const $resolveAuthorityFor = async ({
    mode,
    sessionActor,
    service
  }: {
    mode: AgentGatewaySessionMode;
    sessionActor: OrgServiceActor;
    service: {
      configuredByActorType: string;
      configuredByUserId?: string | null;
      configuredByIdentityId?: string | null;
    };
  }): Promise<{ actor: OrgServiceActor } | { reason: BrokerUnavailableReason }> => {
    if (mode === AgentGatewaySessionMode.Local) return { actor: sessionActor };

    if (service.configuredByActorType === ActorType.USER) {
      if (!service.configuredByUserId || !(await userDAL.findById(service.configuredByUserId))) {
        return { reason: BrokerUnavailableReason.ConfigurerDeleted };
      }
      return {
        actor: {
          type: ActorType.USER,
          id: service.configuredByUserId,
          authMethod: null,
          orgId: sessionActor.orgId,
          rootOrgId: sessionActor.rootOrgId,
          parentOrgId: sessionActor.parentOrgId
        }
      };
    }

    if (!service.configuredByIdentityId || !(await identityDAL.findById(service.configuredByIdentityId))) {
      return { reason: BrokerUnavailableReason.ConfigurerDeleted };
    }
    return {
      actor: {
        type: ActorType.IDENTITY,
        id: service.configuredByIdentityId,
        authMethod: null,
        orgId: sessionActor.orgId,
        rootOrgId: sessionActor.rootOrgId,
        parentOrgId: sessionActor.parentOrgId
      }
    };
  };

  const $resolveStaticValues = async ({
    actor,
    projectId,
    environment,
    secretPath,
    keys
  }: {
    actor: OrgServiceActor;
    projectId: string;
    environment: string;
    secretPath: string;
    keys: string[];
  }): Promise<Map<string, string>> => {
    if (!keys.length) return new Map();

    try {
      const { secrets } = await secretV2BridgeService.getSecrets({
        actor: actor.type,
        actorId: actor.id,
        actorOrgId: actor.orgId,
        actorAuthMethod: actor.authMethod,
        projectId,
        environment,
        path: secretPath,
        keys,
        includeImports: true,
        recursive: false,
        viewSecretValue: true,
        throwOnMissingReadValuePermission: false,
        expandSecretReferences: true,
        expandPersonalOverrides: false,
        personalOverridesBehavior: PersonalOverridesBehavior.NeverInclude,
        secretImportReferencesBehavior: SecretImportReferencesBehavior.Relative
      });

      return new Map(
        secrets.filter((s) => !s.secretValueHidden && s.secretValue).map((s) => [s.secretKey, s.secretValue])
      );
    } catch (err) {
      // A configurer who lost project access makes the permission lookup throw rather than return an empty
      // set, so this is the ordinary revoked-configurer path, not an exceptional one. The error body is
      // deliberately not logged: it can quote secret values.
      logger.warn(
        `agent gateway broker: static secret resolution failed [projectId=${projectId}] [environment=${environment}] [secretPath=${secretPath}]`
      );
      return new Map();
    }
  };

  // Minting is a provider network call (AWS/GCP/Kubernetes SDKs), so it never happens inside a transaction
  // and never per proxied request. An unexpired lease for this session is reused, which is what keeps a
  // 60-second poll from churning a fresh database user every minute.
  const $resolveDynamicValues = async ({
    session,
    projectId,
    projectSlug,
    credentials,
    authorityByServiceId
  }: {
    session: { id: string; expiresAt: Date };
    projectId: string;
    projectSlug: string;
    credentials: {
      id: string;
      serviceId: string;
      environment: string;
      secretPath: string;
      dynamicSecretName: string;
      dynamicSecretField: string;
    }[];
    authorityByServiceId: Map<string, OrgServiceActor>;
  }) => {
    const resolved = new Map<string, { value?: string; leaseId?: string; leaseExpiresAt?: Date; failed?: boolean }>();
    if (!credentials.length) return resolved;

    const existing = await agentGatewaySessionLeaseDAL.findBySessionId(session.id);
    const existingByCredentialId = new Map(existing.map((row) => [row.credentialId, row]));

    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const pick = (output: Record<string, unknown>, field: string) => {
      const value = output[field];
      return value === undefined || value === null ? undefined : String(value);
    };

    const resolveOne = async (credential: (typeof credentials)[number]) => {
      const reusable = existingByCredentialId.get(credential.id);
      if (reusable && reusable.expiresAt > new Date()) {
        const output = JSON.parse(decryptor({ cipherTextBlob: reusable.encryptedOutput }).toString()) as Record<
          string,
          unknown
        >;
        const value = pick(output, credential.dynamicSecretField);
        return {
          value,
          leaseId: reusable.dynamicSecretLeaseId,
          leaseExpiresAt: reusable.expiresAt,
          failed: value === undefined
        };
      }

      const authority = authorityByServiceId.get(credential.serviceId);
      if (!authority) return { failed: true };

      // Clamped to the session's remaining life: a lease that outlives the session that minted it is a
      // credential with no owner tracking it.
      const remainingSeconds = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
      const ttlSeconds = Math.min(Math.max(remainingSeconds, 60), LEASE_TTL_CEILING_SECONDS);

      try {
        const { lease, data } = await dynamicSecretLeaseService.create({
          name: credential.dynamicSecretName,
          path: credential.secretPath,
          environmentSlug: credential.environment,
          projectSlug,
          ttl: `${ttlSeconds}s`,
          actor: authority.type,
          actorId: authority.id,
          actorAuthMethod: authority.authMethod,
          actorOrgId: authority.orgId
        });

        const output = (data ?? {}) as Record<string, unknown>;
        await agentGatewaySessionLeaseDAL.create({
          sessionId: session.id,
          dynamicSecretLeaseId: lease.id,
          credentialId: credential.id,
          encryptedOutput: encryptor({ plainText: Buffer.from(JSON.stringify(output)) }).cipherTextBlob,
          expiresAt: lease.expireAt
        });

        const value = pick(output, credential.dynamicSecretField);
        return { value, leaseId: lease.id, leaseExpiresAt: lease.expireAt, failed: value === undefined };
      } catch (err) {
        // The provider call failed or the authority cannot lease. Never log the error body: a provider
        // error can quote the credential it just minted.
        logger.warn(
          `agent gateway broker: dynamic secret lease failed [sessionId=${session.id}] [dynamicSecretName=${credential.dynamicSecretName}]`
        );
        return { failed: true };
      }
    };

    // Sequential: each iteration is a provider network call, and fanning them out would put an unbounded
    // number of external requests in flight for one bundle fetch.
    for await (const credential of credentials) {
      resolved.set(credential.id, await resolveOne(credential));
    }

    return resolved;
  };

  const openSession = async (
    {
      agentGatewayId,
      mode,
      ttlSeconds
    }: { agentGatewayId: string; mode: AgentGatewaySessionMode; ttlSeconds?: number },
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);

    const agentGateway = await $findAgentGateway(agentGatewayId);
    const project = await projectDAL.findById(agentGateway.projectId);
    if (!project) {
      throw new NotFoundError({ message: `Project with ID '${agentGateway.projectId}' not found` });
    }

    await agentGatewayAccessService.assertActorMayUse({
      agentGatewayId,
      projectId: agentGateway.projectId,
      actor
    });

    const linkedServices = await agentGatewayServiceLinkDAL.findServicesByAgentGatewayIds([agentGatewayId]);
    if (!linkedServices.length) {
      throw new BadRequestError({
        message: `Agent Gateway '${agentGateway.name}' has no proxied services connected, so nothing would be brokered. Connect at least one service first.`
      });
    }

    let pinnedGatewayId: string | null = null;
    if (mode === AgentGatewaySessionMode.Remote) {
      if (!agentGateway.gatewayId && !agentGateway.gatewayPoolId) {
        throw new BadRequestError({
          message: `Agent Gateway '${agentGateway.name}' has no Gateway assigned. Assign one under Secrets Management > Agentic > Agent Gateways, or run it locally with 'infisical secrets agent gateway run'.`
        });
      }

      // Resolved once and pinned: pool selection is random per call, and a renewal landing on a different
      // member would strand this session's leases and MITM state on the previous gateway.
      pinnedGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
        gatewayId: agentGateway.gatewayId,
        gatewayPoolId: agentGateway.gatewayPoolId
      });

      if (!pinnedGatewayId) {
        throw new BadRequestError({
          message: `Agent Gateway '${agentGateway.name}' has no reachable Gateway right now. Check the Gateway is running, then retry.`
        });
      }

      // Enforced server-side rather than only filtered in the picker, because a gateway can be downgraded
      // after it was attached.
      if (agentGateway.gatewayId) {
        if (
          !isGatewayHealthy({
            heartbeat: agentGateway.gatewayHeartbeat,
            heartbeatTTL: agentGateway.gatewayHeartbeatTTL
          })
        ) {
          throw new BadRequestError({
            message: `The Gateway '${agentGateway.gatewayName ?? pinnedGatewayId}' that brokers '${agentGateway.name}' is not connected. Ask its operator to check the gateway service, then retry.`
          });
        }
        if (!(agentGateway.gatewayCapabilities as TGatewayCapabilities | null)?.agentProxy) {
          throw new BadRequestError({
            message: `Gateway '${agentGateway.gatewayName ?? pinnedGatewayId}' is running a CLI version without Agent Gateway support. Upgrade the gateway and restart it.`
          });
        }
      }
    } else if (!agentGateway.isLocalModeEnabled) {
      throw new BadRequestError({
        message: `Agent Gateway '${agentGateway.name}' does not allow local mode. Enable local mode on it, or use 'infisical secrets agent gateway connect' instead.`
      });
    }

    const actorName =
      actor.type === ActorType.USER
        ? (await userDAL.findById(actor.id))?.email || actor.id
        : (await identityDAL.findById(actor.id))?.name || actor.id;

    const expiresAt = new Date(Date.now() + (ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS) * 1000);

    // Only writes here. Everything expensive (permission lookups, provider calls) already happened above,
    // so this transaction holds one of ten pool connections for a single insert.
    const session = await agentGatewaySessionDAL.create({
      agentGatewayId,
      projectId: agentGateway.projectId,
      gatewayId: pinnedGatewayId,
      mode,
      status: AgentGatewaySessionStatus.Active,
      actorUserId: actor.type === ActorType.USER ? actor.id : null,
      actorIdentityId: actor.type === ActorType.IDENTITY ? actor.id : null,
      actorName,
      expiresAt
    });

    await agentGatewayDAL.stampLastUsed(agentGatewayId);

    return {
      session,
      agentGateway,
      projectSlug: project.slug,
      renewAfterSeconds: SESSION_RENEW_AFTER_SECONDS
    };
  };

  const $assertSessionReadable = async ({
    sessionId,
    caller
  }: {
    sessionId: string;
    caller: { type: ActorType; id: string };
  }) => {
    const session = await agentGatewaySessionDAL.findActiveById(sessionId);
    // 404 rather than 403 for a session that is not the caller's, so the endpoint cannot be used to probe
    // for session ids belonging to another gateway or another org.
    if (!session) {
      throw new NotFoundError({ message: `Agent Gateway session with ID '${sessionId}' not found` });
    }

    if (caller.type === ActorType.GATEWAY) {
      if (session.gatewayId !== caller.id) {
        throw new NotFoundError({ message: `Agent Gateway session with ID '${sessionId}' not found` });
      }
      return session;
    }

    const isOwner =
      (caller.type === ActorType.USER && session.actorUserId === caller.id) ||
      (caller.type === ActorType.IDENTITY && session.actorIdentityId === caller.id);
    if (!isOwner) {
      throw new NotFoundError({ message: `Agent Gateway session with ID '${sessionId}' not found` });
    }

    // A remote session's bundle is for the gateway holding the credentials, not for the agent's own host.
    if (session.mode === AgentGatewaySessionMode.Remote) {
      throw new ForbiddenRequestError({
        message: "A remote Agent Gateway session's credentials are delivered to its Gateway, not to the caller"
      });
    }

    return session;
  };

  const resolveBundle = async ({
    sessionId,
    caller
  }: {
    sessionId: string;
    // The org triple comes from the caller because the session row does not store it: a bundle resolved for
    // a sub-org configurer has to resolve in the org they actually belong to.
    caller: { type: ActorType; id: string; orgId: string; rootOrgId: string; parentOrgId: string };
  }): Promise<{ bundle: TBrokerBundle; session: NonNullable<TSessionRow>; secretRefs: TBrokerSecretRef[] }> => {
    const session = await $assertSessionReadable({ sessionId, caller });

    if (session.expiresAt <= new Date()) {
      throw new ForbiddenRequestError({
        message: "This Agent Gateway session has expired. Restart the command to open a new one."
      });
    }

    const sessionActor: OrgServiceActor = {
      type: session.actorUserId ? ActorType.USER : ActorType.IDENTITY,
      id: (session.actorUserId ?? session.actorIdentityId) as string,
      authMethod: null,
      orgId: caller.orgId,
      rootOrgId: caller.rootOrgId,
      parentOrgId: caller.parentOrgId
    };

    const project = await projectDAL.findById(session.projectId);
    if (!project) {
      throw new NotFoundError({ message: `Project with ID '${session.projectId}' not found` });
    }

    const linked = await agentGatewayServiceLinkDAL.findServicesByAgentGatewayIds([session.agentGatewayId]);
    const credentials = await proxiedServiceCredentialDAL.findByServiceIds(linked.map((s) => s.id));

    // One authority per service, resolved once rather than per credential.
    const authorityByServiceId = new Map<string, OrgServiceActor>();
    const authorityFailureByServiceId = new Map<string, BrokerUnavailableReason>();
    for await (const service of linked) {
      const authority = await $resolveAuthorityFor({
        mode: session.mode as AgentGatewaySessionMode,
        sessionActor,
        service
      });
      if ("actor" in authority) authorityByServiceId.set(service.id, authority.actor);
      else authorityFailureByServiceId.set(service.id, authority.reason);
    }

    // Static secrets grouped by (authority, environment, secretPath) so one getSecrets call covers every
    // credential that shares a location.
    const staticGroups = new Map<
      string,
      { serviceIds: Set<string>; environment: string; secretPath: string; keys: Set<string> }
    >();
    credentials.forEach((credential) => {
      if (!credential.secretKey) return;
      const authority = authorityByServiceId.get(credential.serviceId);
      if (!authority) return;
      const key = `${authority.type}:${authority.id}:${credential.environment}:${credential.secretPath}`;
      const group = staticGroups.get(key);
      if (group) {
        group.keys.add(credential.secretKey);
        group.serviceIds.add(credential.serviceId);
        return;
      }
      staticGroups.set(key, {
        serviceIds: new Set([credential.serviceId]),
        environment: credential.environment,
        secretPath: credential.secretPath,
        keys: new Set([credential.secretKey])
      });
    });

    const staticValues = new Map<string, Map<string, string>>();
    for await (const [key, group] of staticGroups.entries()) {
      const anyServiceId = [...group.serviceIds][0];
      const authority = authorityByServiceId.get(anyServiceId) as OrgServiceActor;
      const values = await $resolveStaticValues({
        actor: authority,
        projectId: session.projectId,
        environment: group.environment,
        secretPath: group.secretPath,
        keys: [...group.keys]
      });
      staticValues.set(key, values);
    }

    const dynamicValues = await $resolveDynamicValues({
      session: { id: session.id, expiresAt: session.expiresAt },
      projectId: session.projectId,
      projectSlug: project.slug,
      credentials: credentials
        .filter((c) => Boolean(c.dynamicSecretName))
        .map((c) => ({
          id: c.id,
          serviceId: c.serviceId,
          environment: c.environment,
          secretPath: c.secretPath,
          dynamicSecretName: c.dynamicSecretName as string,
          dynamicSecretField: c.dynamicSecretField as string
        })),
      authorityByServiceId
    });

    const credentialsByService = credentials.reduce<Record<string, typeof credentials>>((acc, credential) => {
      acc[credential.serviceId] = acc[credential.serviceId] || [];
      acc[credential.serviceId].push(credential);
      return acc;
    }, {});

    const services: TBrokerService[] = linked.map((service) => {
      const serviceCredentials = credentialsByService[service.id] ?? [];
      const authority = authorityByServiceId.get(service.id);

      return {
        id: service.id,
        name: service.name,
        hostPattern: service.hostPattern,
        isEnabled: service.isEnabled,
        priority: service.priority,
        credentials: serviceCredentials.map<TBrokerCredential>((credential) => {
          const base = {
            id: credential.id,
            role: credential.role as ProxiedServiceCredentialRole,
            headerName: credential.headerName,
            headerPrefix: credential.headerPrefix,
            headerPurpose: credential.headerPurpose,
            placeholderKey: credential.placeholderKey,
            placeholderValue: credential.placeholderValue,
            substitutionSurfaces: credential.substitutionSurfaces,
            secretKey: credential.secretKey,
            dynamicSecretName: credential.dynamicSecretName,
            dynamicSecretField: credential.dynamicSecretField
          };

          if (!service.isEnabled) {
            return {
              ...base,
              kind: credential.dynamicSecretName ? "dynamic" : "static",
              unavailable: true,
              unavailableReason: BrokerUnavailableReason.ServiceDisabled
            };
          }

          if (!authority) {
            return {
              ...base,
              kind: credential.dynamicSecretName ? "dynamic" : "static",
              unavailable: true,
              unavailableReason:
                authorityFailureByServiceId.get(service.id) ?? BrokerUnavailableReason.ConfigurerLostAccess
            };
          }

          if (credential.dynamicSecretName) {
            const dynamic = dynamicValues.get(credential.id);
            if (!dynamic || dynamic.failed || dynamic.value === undefined) {
              return {
                ...base,
                kind: "dynamic",
                unavailable: true,
                unavailableReason: BrokerUnavailableReason.DynamicSecretLeaseFailed
              };
            }
            return {
              ...base,
              kind: "dynamic",
              value: dynamic.value,
              leaseId: dynamic.leaseId,
              leaseExpiresAt: dynamic.leaseExpiresAt
            };
          }

          const groupKey = `${authority.type}:${authority.id}:${credential.environment}:${credential.secretPath}`;
          const value = staticValues.get(groupKey)?.get(credential.secretKey as string);
          if (value === undefined) {
            return {
              ...base,
              kind: "static",
              unavailable: true,
              unavailableReason: BrokerUnavailableReason.ConfigurerLostAccess
            };
          }

          return { ...base, kind: "static", value };
        })
      };
    });

    const secretRefs: TBrokerSecretRef[] = credentials.map((credential) => ({
      environment: credential.environment,
      secretPath: credential.secretPath,
      secretKey: credential.secretKey ?? undefined,
      dynamicSecretName: credential.dynamicSecretName ?? undefined
    }));

    const refFingerprint = fingerprintSecretRefs(secretRefs);
    await agentGatewaySessionDAL.stampResolved({ id: session.id, refFingerprint });

    return { bundle: { services, refFingerprint }, session, secretRefs };
  };

  const renewSession = async ({ sessionId }: { sessionId: string }, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);

    const session = await agentGatewaySessionDAL.findActiveById(sessionId);
    if (!session) {
      throw new NotFoundError({ message: `Agent Gateway session with ID '${sessionId}' not found` });
    }

    const isOwner =
      (actor.type === ActorType.USER && session.actorUserId === actor.id) ||
      (actor.type === ActorType.IDENTITY && session.actorIdentityId === actor.id);
    if (!isOwner) {
      throw new NotFoundError({ message: `Agent Gateway session with ID '${sessionId}' not found` });
    }

    // Renewal is where the access list is re-checked, which is what makes removing a principal take effect
    // on a session that is already running.
    await agentGatewayAccessService.assertActorMayUse({
      agentGatewayId: session.agentGatewayId,
      projectId: session.projectId,
      actor
    });

    const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_SECONDS * 1000);
    await agentGatewaySessionDAL.updateById(session.id, { expiresAt });

    return { session: { ...session, expiresAt }, renewAfterSeconds: SESSION_RENEW_AFTER_SECONDS };
  };

  // Revoked through the platform revocation queue, not through revokeLease: revokeLease is gated on an
  // actor's Lease permission, and by session-end time the actor may be gone, may have lost access, or may
  // never have had it (remote mode leases under the service's configurer). The queue path is the same one
  // the lease's own expiry uses and needs no actor at all. Each lease already has a revocation job
  // scheduled for its natural expiry keyed by leaseId, so the scheduled job is cancelled first and
  // replaced with one due now.
  const $revokeSessionLeases = async (session: { id: string }) => {
    const leases = await agentGatewaySessionLeaseDAL.findBySessionId(session.id);

    for await (const lease of leases) {
      try {
        await dynamicSecretLeaseQueueService.unsetLeaseRevocation(lease.dynamicSecretLeaseId);
        await dynamicSecretLeaseQueueService.setLeaseRevocation(
          lease.dynamicSecretLeaseId,
          lease.dynamicSecretId,
          new Date()
        );
      } catch (err) {
        logger.error(
          { err },
          `agent gateway broker: failed to queue lease revocation on session end [sessionId=${session.id}] [leaseId=${lease.dynamicSecretLeaseId}]`
        );
      }
    }
  };

  // Turns "credentials stop resolving on the next refresh" into "the tunnel is gone now" for a remote
  // session. Best effort on purpose: a gateway that is unreachable, or has already dropped the session,
  // cannot broker it either, and the ended row is what the next bundle fetch fails on regardless.
  const $signalGatewayToDropSession = async (session: NonNullable<TSessionRow>) => {
    if (session.mode !== AgentGatewaySessionMode.Remote || !session.gatewayId) return;

    try {
      const agentGateway = await agentGatewayDAL.findByIdWithTransport(session.agentGatewayId);
      if (!agentGateway) return;

      await gatewayV2Service.signalAgentGatewaySessionCancellation({
        gatewayId: session.gatewayId,
        agentGatewayId: session.agentGatewayId,
        agentGatewayName: agentGateway.name,
        sessionId: session.id
      });
    } catch (err) {
      logger.debug(
        { err },
        `agent gateway: session cancellation signal failed (best-effort) [sessionId=${session.id}]`
      );
    }
  };

  // Idempotent, and callable by whoever notices first. The CLI calls it on child exit and the gateway on
  // mux close, but both are best-effort hints: a SIGKILLed CLI or a crashed gateway never calls it, which
  // is why the expiry cron is the authoritative revoker.
  const endSession = async (
    { sessionId, status }: { sessionId: string; status?: AgentGatewaySessionStatus },
    caller: { type: ActorType; id: string }
  ) => {
    const session = await agentGatewaySessionDAL.findActiveById(sessionId);
    if (!session) return null;

    if (caller.type === ActorType.GATEWAY) {
      if (session.gatewayId !== caller.id) return null;
    } else {
      const isOwner =
        (caller.type === ActorType.USER && session.actorUserId === caller.id) ||
        (caller.type === ActorType.IDENTITY && session.actorIdentityId === caller.id);
      if (!isOwner) return null;
    }

    await $revokeSessionLeases(session);
    await agentGatewaySessionDAL.updateById(session.id, {
      status: status ?? AgentGatewaySessionStatus.Ended,
      endedAt: new Date()
    });

    // Not when the gateway itself is the caller: it is telling us the mux is already gone.
    if (caller.type !== ActorType.GATEWAY) {
      await $signalGatewayToDropSession(session);
    }

    return session;
  };

  // What the CLI needs to reach a remote session's broker: the relay and gateway mTLS material, the org
  // root CA the agent's HTTP clients must trust, and the placeholder environment variables. Never the
  // brokered values themselves — those go to the gateway, which is the point of remote mode.
  const getTransport = async ({ sessionId }: { sessionId: string }, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);

    const session = await agentGatewaySessionDAL.findActiveById(sessionId);
    if (!session) {
      throw new NotFoundError({ message: `Agent Gateway session with ID '${sessionId}' not found` });
    }

    const isOwner =
      (actor.type === ActorType.USER && session.actorUserId === actor.id) ||
      (actor.type === ActorType.IDENTITY && session.actorIdentityId === actor.id);
    if (!isOwner) {
      throw new NotFoundError({ message: `Agent Gateway session with ID '${sessionId}' not found` });
    }

    if (session.mode !== AgentGatewaySessionMode.Remote || !session.gatewayId) {
      throw new BadRequestError({
        message: "This is a local Agent Gateway session, so there is no gateway transport to connect to"
      });
    }

    const agentGateway = await $findAgentGateway(session.agentGatewayId);

    const connection = await gatewayV2Service.getAgentGatewayConnectionDetails({
      gatewayId: session.gatewayId,
      agentGatewayId: session.agentGatewayId,
      agentGatewayName: agentGateway.name,
      sessionId: session.id,
      unmatchedHostPolicy: agentGateway.unmatchedHostPolicy,
      allowedHosts: agentGateway.allowedHosts ?? [],
      // Deliberately much shorter than the session: the certificate is the revocation clock, and the CLI
      // re-earns it at renewal, where the access list is re-checked.
      duration: CLIENT_CERT_TTL_SECONDS * 1000,
      actorMetadata: { id: actor.id, type: actor.type, name: session.actorName }
    });

    if (!connection) {
      throw new BadRequestError({
        message: `The Gateway that brokers '${agentGateway.name}' could not be reached to establish a connection. Check it is running, then retry.`
      });
    }

    // The agent has to trust whatever the broker presents when it terminates TLS, and in remote mode that
    // is the gateway signing leaves from an intermediate off this root.
    const caCertificate = await agentProxyCaService.getRootCaCertificateForOrg(actor.orgId);

    const linked = await agentGatewayServiceLinkDAL.findServicesByAgentGatewayIds([session.agentGatewayId]);
    const credentials = await proxiedServiceCredentialDAL.findByServiceIds(linked.map((s) => s.id));

    return {
      session,
      relayHost: connection.relayHost,
      gateway: connection.gateway,
      relay: connection.relay,
      caCertificate,
      // Only substitution credentials need anything in the agent's environment. A header rewrite is applied
      // by the broker itself, so the agent never sees or sends a value for it.
      placeholders: credentials
        .filter((c) => c.role === ProxiedServiceCredentialRole.CredentialSubstitution && c.placeholderKey)
        .map((c) => ({ key: c.placeholderKey as string, value: c.placeholderValue as string })),
      hostPatterns: linked.filter((s) => s.isEnabled).map((s) => s.hostPattern),
      expiresAt: session.expiresAt,
      certificateExpiresAt: new Date(Date.now() + CLIENT_CERT_TTL_SECONDS * 1000)
    };
  };

  // An admin kill switch. Unlike endSession this does not require being the session's owner, because the
  // point is to stop someone else's session.
  const terminateSession = async ({ sessionId }: { sessionId: string }, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);

    const session = await agentGatewaySessionDAL.findActiveById(sessionId);
    if (!session) {
      throw new NotFoundError({ message: `Agent Gateway session with ID '${sessionId}' not found` });
    }

    const agentGateway = await $findAgentGateway(session.agentGatewayId);
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: agentGateway.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentGatewayActions.Edit,
      ProjectPermissionSub.AgentGateways
    );

    await $revokeSessionLeases(session);
    await agentGatewaySessionDAL.updateById(session.id, {
      status: AgentGatewaySessionStatus.Ended,
      endedAt: new Date()
    });
    await $signalGatewayToDropSession(session);

    return { session, agentGateway };
  };

  // Stamps "last used" on the services a broker actually applied. Reported by the broker rather than the
  // agent, and filtered to the services this session's agent gateway brokers, so a caller cannot stamp a
  // service it has nothing to do with.
  const reportUsage = async ({
    sessionId,
    serviceIds,
    caller
  }: {
    sessionId: string;
    serviceIds: string[];
    caller: { type: ActorType; id: string };
  }) => {
    const session = await $assertSessionReadable({ sessionId, caller });

    const linked = await agentGatewayServiceLinkDAL.findServicesByAgentGatewayIds([session.agentGatewayId]);
    const brokerable = new Set(linked.map((service) => service.id));

    for await (const serviceId of new Set(serviceIds.filter((id) => brokerable.has(id)))) {
      await proxiedServiceService.stampUsage(serviceId);
    }

    await agentGatewayDAL.stampLastUsed(session.agentGatewayId);
  };

  // Recording. The broker reports what it did in batches, which is why the request carries its own clock:
  // a batch arrives seconds after the fact and ordering by arrival would scramble the replay.
  const recordRequests = async ({
    sessionId,
    requests,
    caller
  }: {
    sessionId: string;
    requests: TSessionRequestInput[];
    caller: { type: ActorType; id: string };
  }) => {
    const session = await $assertSessionReadable({ sessionId, caller });

    await agentGatewaySessionRequestDAL.insertMany(
      requests.map((request) => ({
        sessionId: session.id,
        occurredAt: request.occurredAt,
        method: request.method,
        host: request.host,
        port: request.port,
        // Belt and braces: the broker truncates, but the column is bounded and a long URL must not fail the
        // whole batch and lose the rest of the recording with it.
        path: request.path?.slice(0, 2048),
        decision: request.decision,
        statusCode: request.statusCode,
        serviceId: request.serviceId,
        serviceName: request.serviceName,
        credentials: request.credentials ? JSON.stringify(request.credentials) : null,
        errorMessage: request.errorMessage?.slice(0, 500)
      }))
    );
  };

  const listSessions = async (
    { agentGatewayId, limit, offset }: { agentGatewayId: string; limit: number; offset: number },
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);

    const agentGateway = await $findAgentGateway(agentGatewayId);
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: agentGateway.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentGatewayActions.Read,
      ProjectPermissionSub.AgentGateways
    );

    const [sessions, totalCount] = await Promise.all([
      agentGatewaySessionDAL.findByAgentGatewayId({ agentGatewayId, limit, offset }),
      agentGatewaySessionDAL.countByAgentGatewayId(agentGatewayId)
    ]);

    const sessionIds = sessions.map((session) => session.id);
    const [requestCounts, brokeredCounts] = await Promise.all([
      agentGatewaySessionRequestDAL.countBySessionIds(sessionIds),
      agentGatewaySessionRequestDAL.countBrokeredBySessionIds(sessionIds)
    ]);

    return {
      totalCount,
      sessions: sessions.map((session) => ({
        id: session.id,
        mode: session.mode,
        status: session.status,
        actorName: session.actorName,
        actorType: (session.actorUserId ? ActorType.USER : ActorType.IDENTITY) as string,
        gatewayId: session.gatewayId ?? null,
        expiresAt: session.expiresAt,
        endedAt: session.endedAt ?? null,
        createdAt: session.createdAt,
        requestCount: requestCounts[session.id] ?? 0,
        brokeredCount: brokeredCounts[session.id] ?? 0
      }))
    };
  };

  // The replay itself. Read access to the agent gateway is the gate, not session ownership: the point of a
  // recording is that somebody other than the person who ran it can review it.
  const listSessionRequests = async (
    { sessionId, limit, offset }: { sessionId: string; limit: number; offset: number },
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);

    const session = await agentGatewaySessionDAL.findById(sessionId);
    if (!session) {
      throw new NotFoundError({ message: `Agent Gateway session with ID '${sessionId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: session.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentGatewayActions.Read,
      ProjectPermissionSub.AgentGateways
    );

    const [requests, totalCount] = await Promise.all([
      agentGatewaySessionRequestDAL.findBySessionId({ sessionId, limit, offset }),
      agentGatewaySessionRequestDAL.countBySessionId(sessionId)
    ]);

    return {
      totalCount,
      session: {
        id: session.id,
        mode: session.mode,
        status: session.status,
        actorName: session.actorName,
        createdAt: session.createdAt,
        endedAt: session.endedAt ?? null
      },
      requests: requests.map((request) => ({
        id: request.id,
        occurredAt: request.occurredAt,
        method: request.method,
        host: request.host,
        port: request.port ?? null,
        path: request.path ?? null,
        decision: request.decision,
        statusCode: request.statusCode ?? null,
        serviceName: request.serviceName ?? null,
        credentials: (request.credentials ?? []) as TSessionRequestCredential[],
        errorMessage: request.errorMessage ?? null
      }))
    };
  };

  // The authoritative revoker. The CLI can be SIGKILLed and the gateway can crash, so neither of their
  // end-of-session calls can be relied on; this is what guarantees a lease is not left running past its
  // session. Returns how many it processed so the cron can tell when it is falling behind.
  const expireSessions = async ({ limit }: { limit: number }) => {
    const expired = await agentGatewaySessionDAL.findExpiredActive(limit);

    for await (const session of expired) {
      try {
        await $revokeSessionLeases(session);
        await agentGatewaySessionDAL.updateById(session.id, {
          status: AgentGatewaySessionStatus.Expired,
          endedAt: new Date()
        });
        await $signalGatewayToDropSession(session);
      } catch (err) {
        // Left active so the next tick retries it: marking it expired here would strand its leases.
        logger.error({ err }, `agent gateway session expiry failed [sessionId=${session.id}]`);
      }
    }

    return expired.length;
  };

  return {
    openSession,
    resolveBundle,
    renewSession,
    endSession,
    getTransport,
    terminateSession,
    reportUsage,
    recordRequests,
    listSessions,
    listSessionRequests,
    expireSessions
  };
};

// Names only. A recorded request never carries a resolved value, a header value or a body.
export type TSessionRequestCredential = {
  key?: string;
  dynamicSecretName?: string;
  dynamicSecretField?: string;
  role?: string;
  header?: string;
  surfaces?: string[];
};

export type TSessionRequestInput = {
  occurredAt: Date;
  method: string;
  host: string;
  port?: number;
  path?: string;
  decision: string;
  statusCode?: number;
  serviceId?: string;
  serviceName?: string;
  credentials?: TSessionRequestCredential[];
  errorMessage?: string;
};

export type TBrokerSecretRef = {
  environment: string;
  secretPath: string;
  secretKey?: string;
  dynamicSecretName?: string;
};
