import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope } from "@app/db/schemas/models";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { ProjectPermissionPamSessionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TPamSessionDALFactory } from "./pam-session-dal";
import { PamSessionStatus } from "./pam-session-enums";
import { decryptSession } from "./pam-session-fns";
import { TUpdateSessionLogsDTO } from "./pam-session-types";

type TPamSessionServiceFactoryDep = {
  pamSessionDAL: TPamSessionDALFactory;
  projectDAL: TProjectDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TPamSessionServiceFactory = ReturnType<typeof pamSessionServiceFactory>;

export const pamSessionServiceFactory = ({
  pamSessionDAL,
  projectDAL,
  permissionService,
  kmsService
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

    const sessions = await pamSessionDAL.find({ projectId });

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

    if (session.status === PamSessionStatus.Ended) {
      return {
        session,
        projectId: project.id
      };
    }

    if (session.status !== PamSessionStatus.Active && session.status !== PamSessionStatus.Starting) {
      throw new BadRequestError({ message: "Cannot end sessions that are not active or starting" });
    }

    const updatedSession = await pamSessionDAL.updateById(sessionId, {
      endedAt: new Date(),
      status: PamSessionStatus.Ended
    });

    return { session: updatedSession, projectId: project.id };
  };

  return { getById, list, updateLogsById, endSessionById };
};
