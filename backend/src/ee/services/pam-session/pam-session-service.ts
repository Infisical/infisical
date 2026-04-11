import { ForbiddenError } from "@casl/ability";
import net from "net";

import { ActionProjectType, OrganizationActionScope } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { createGatewayConnection, createRelayConnection } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { PamResource } from "../pam-resource/pam-resource-enums";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { ProjectPermissionPamSessionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TPamSessionDALFactory } from "./pam-session-dal";
import { PamSessionStatus } from "./pam-session-enums";
import { TPamSessionEventBatchDALFactory } from "./pam-session-event-batch-dal";
import { decryptBatches, decryptSession, decryptSessionCommandLogs } from "./pam-session-fns";
import { TUpdateSessionLogsDTO, TUploadEventBatchDTO } from "./pam-session-types";

type TPamSessionServiceFactoryDep = {
  pamSessionDAL: TPamSessionDALFactory;
  pamSessionEventBatchDAL: TPamSessionEventBatchDALFactory;
  projectDAL: TProjectDALFactory;
  userDAL: Pick<TUserDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
};

export type TPamSessionServiceFactory = ReturnType<typeof pamSessionServiceFactory>;

export const pamSessionServiceFactory = ({
  pamSessionDAL,
  pamSessionEventBatchDAL,
  projectDAL,
  userDAL,
  permissionService,
  kmsService,
  gatewayV2Service
}: TPamSessionServiceFactoryDep) => {
  // Helper to check and update expired sessions when viewing session details (redundancy for scheduled job)
  // Only applies to non-gateway sessions (e.g., AWS IAM) - gateway sessions are managed by the gateway
  // This is intentionally only called in getById (session details view), not in list
  const checkAndExpireSessionIfNeeded = async <
    T extends { id: string; status: string; expiresAt: Date | null; gatewayIdentityId?: string | null }
  >(
    session: T
  ): Promise<T> => {
    // Skip gateway-based sessions - they have their own lifecycle managed by the gateway
    if (session.gatewayIdentityId) {
      return session;
    }

    const isActive = session.status === PamSessionStatus.Active || session.status === PamSessionStatus.Starting;
    const isExpired = session.expiresAt && new Date(session.expiresAt) <= new Date();

    if (isActive && isExpired) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const updatedSession = await pamSessionDAL.updateById(session.id, {
        status: PamSessionStatus.Ended,
        endedAt: new Date()
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return { ...session, ...updatedSession };
    }

    return session;
  };

  const getById = async (sessionId: string, actor: OrgServiceActor) => {
    const sessionFromDb = await pamSessionDAL.findById(sessionId);
    if (!sessionFromDb) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

    const session = await checkAndExpireSessionIfNeeded(sessionFromDb);

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: session.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamSessionActions.Read,
      ProjectPermissionSub.PamSessions
    );

    return {
      session: await decryptSession(session, session.projectId, kmsService)
    };
  };

  const list = async (projectId: string, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamSessionActions.Read,
      ProjectPermissionSub.PamSessions
    );

    const sessions = await pamSessionDAL.findByProjectId(projectId);

    return {
      sessions: await Promise.all(sessions.map((session) => decryptSession(session, projectId, kmsService)))
    };
  };

  const updateLogsById = async ({ sessionId, logs }: TUpdateSessionLogsDTO, actor: OrgServiceActor) => {
    // To be hit by gateways only
    if (actor.type !== ActorType.IDENTITY) {
      throw new ForbiddenRequestError({ message: "Only gateways can perform this action" });
    }

    const session = await pamSessionDAL.findById(sessionId);
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

    if (session.encryptedLogsBlob) {
      throw new BadRequestError({ message: "Cannot update logs for sessions with existing logs" });
    }

    const project = await projectDAL.findById(session.projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${session.projectId}' not found` });

    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: project.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.CreateGateways,
      OrgPermissionSubjects.Gateway
    );

    if (session.gatewayIdentityId && session.gatewayIdentityId !== actor.id) {
      throw new ForbiddenRequestError({ message: "Identity does not have access to update logs for this session" });
    }

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: session.projectId
    });

    const { cipherTextBlob } = encryptor({
      plainText: Buffer.from(JSON.stringify(logs))
    });

    const updatedSession = await pamSessionDAL.updateById(sessionId, {
      encryptedLogsBlob: cipherTextBlob
    });

    return { session: updatedSession, projectId: project.id };
  };

  const endSessionById = async (sessionId: string, actor: OrgServiceActor) => {
    const session = await pamSessionDAL.findById(sessionId);
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

    const project = await projectDAL.findById(session.projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${session.projectId}' not found` });

    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: project.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });

    if (actor.type === ActorType.IDENTITY) {
      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionGatewayActions.CreateGateways,
        OrgPermissionSubjects.Gateway
      );

      if (session.gatewayIdentityId && session.gatewayIdentityId !== actor.id) {
        throw new ForbiddenRequestError({ message: "Identity does not have access to end this session" });
      }
    } else if (actor.type === ActorType.USER) {
      if (session.userId !== actor.id) {
        throw new ForbiddenRequestError({ message: "You are not authorized to end this session" });
      }
    } else {
      throw new ForbiddenRequestError({ message: "Only identities and users can perform this action" });
    }

    const updatedSession = await pamSessionDAL.endSessionById(sessionId);
    if (!updatedSession) {
      if (session.status !== PamSessionStatus.Ended && session.status !== PamSessionStatus.Terminated) {
        throw new BadRequestError({ message: "Cannot end sessions that are not active or starting" });
      }
      return { session, projectId: project.id, alreadyEnded: true };
    }

    return { session: updatedSession, projectId: project.id, alreadyEnded: false };
  };

  const terminateSessionById = async (sessionId: string, actor: OrgServiceActor) => {
    const session = await pamSessionDAL.findById(sessionId);
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

    const project = await projectDAL.findById(session.projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${session.projectId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: session.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamSessionActions.Terminate,
      ProjectPermissionSub.PamSessions
    );

    // Atomic update: only transitions active/starting → terminated
    const updatedSession = await pamSessionDAL.terminateSessionById(sessionId);
    if (!updatedSession) {
      return { session, projectId: project.id, alreadyEnded: true };
    }

    // Fire-and-forget ALPN cancellation for gateway sessions
    if (session.gatewayId) {
      void (async () => {
        let relayConn: net.Socket | null = null;
        try {
          const user = await userDAL.findById(actor.id);
          const certs = await gatewayV2Service.getPAMConnectionDetails({
            gatewayId: session.gatewayId,
            sessionId,
            resourceType: session.resourceType as PamResource,
            // host/port are embedded in cert extensions for routing but not used for cancellation —
            // real values are encrypted in PamResource.encryptedConnectionDetails and not worth decrypting here
            host: "0.0.0.0",
            port: 0,
            actorMetadata: { id: actor.id, type: actor.type, name: user?.email ?? "" }
          });
          if (!certs) {
            logger.error(
              { sessionId, gatewayId: session.gatewayId },
              `Failed to get gateway [gatewayId=${session.gatewayId}] connection details for PAM session [sessionId=${sessionId}] termination`
            );
            return;
          }
          relayConn = await createRelayConnection({
            relayHost: certs.relayHost,
            clientCertificate: certs.relay.clientCertificate,
            clientPrivateKey: certs.relay.clientPrivateKey,
            serverCertificateChain: certs.relay.serverCertificateChain
          });
          const cancelConn = await createGatewayConnection(
            relayConn,
            certs.gateway,
            GatewayProxyProtocol.PamSessionCancellation
          );
          cancelConn.end();
        } catch (err) {
          logger.error(
            { sessionId, err },
            `Session [sessionId=${sessionId}] termination ALPN signal failed (best-effort)`
          );
        } finally {
          relayConn?.destroy();
        }
      })();
    }

    return { session: updatedSession, projectId: project.id, alreadyEnded: false };
  };

  const getSessionLogs = async (sessionId: string, offset: number, limit: number, actor: OrgServiceActor) => {
    const sessionFromDb = await pamSessionDAL.findById(sessionId);
    if (!sessionFromDb) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: sessionFromDb.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamSessionActions.Read,
      ProjectPermissionSub.PamSessions
    );

    // Fetch one extra to determine whether another page exists
    const batches = await pamSessionEventBatchDAL.findBySessionIdPaginated(sessionId, {
      offset,
      limit: limit + 1
    });

    if (batches.length > 0 || offset > 0) {
      // Batch-based session
      const hasMore = batches.length > limit;
      const pageBatches = hasMore ? batches.slice(0, limit) : batches;
      const logs = pageBatches.length > 0 ? await decryptBatches(pageBatches, sessionFromDb.projectId, kmsService) : [];
      return { logs, hasMore, batchCount: pageBatches.length };
    }

    // Legacy blob-based session — bounded by Fastify body limit on upload
    if (sessionFromDb.encryptedLogsBlob) {
      const logs = await decryptSessionCommandLogs({
        projectId: sessionFromDb.projectId,
        encryptedLogs: sessionFromDb.encryptedLogsBlob,
        kmsService
      });
      return { logs, hasMore: false, batchCount: 0 };
    }

    return { logs: [], hasMore: false, batchCount: 0 };
  };

  const uploadEventBatch = async ({ sessionId, startOffset, events }: TUploadEventBatchDTO, actor: OrgServiceActor) => {
    if (actor.type !== ActorType.IDENTITY) {
      throw new ForbiddenRequestError({ message: "Only gateways can perform this action" });
    }

    const session = await pamSessionDAL.findById(sessionId);
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

    const project = await projectDAL.findById(session.projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${session.projectId}' not found` });

    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: project.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.CreateGateways,
      OrgPermissionSubjects.Gateway
    );

    if (session.gatewayIdentityId && session.gatewayIdentityId !== actor.id) {
      throw new ForbiddenRequestError({ message: "Identity does not have access to upload events for this session" });
    }

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: session.projectId
    });

    const { cipherTextBlob } = encryptor({ plainText: events });

    const { wasInserted } = await pamSessionEventBatchDAL.upsertBatch(sessionId, startOffset, cipherTextBlob);

    return { projectId: project.id, wasInserted };
  };

  return { getById, list, getSessionLogs, updateLogsById, endSessionById, terminateSessionById, uploadEventBatch };
};
