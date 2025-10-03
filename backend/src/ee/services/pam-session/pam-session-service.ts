import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { ProjectPermissionPamSessionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TUpdateSessionLogsDTO } from "./pam-session.types";
import { TPamSessionDALFactory } from "./pam-session-dal";
import { PamSessionStatus } from "./pam-session-enums";
import { decryptSession } from "./pam-session-fns";

type TPamSessionServiceFactoryDep = {
  pamSessionDAL: TPamSessionDALFactory;
  projectDAL: TProjectDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TPamSessionServiceFactory = ReturnType<typeof pamSessionServiceFactory>;

export const pamSessionServiceFactory = ({
  pamSessionDAL,
  projectDAL,
  permissionService,
  licenseService,
  kmsService
}: TPamSessionServiceFactoryDep) => {
  const getById = async (sessionId: string, actor: OrgServiceActor) => {
    const session = await pamSessionDAL.findById(sessionId);
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

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
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

    // To be hit by gateways only
    if (actor.type !== ActorType.IDENTITY) {
      throw new ForbiddenRequestError({ message: "Only gateways can perform this action" });
    }

    const session = await pamSessionDAL.findById(sessionId);
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

    const project = await projectDAL.findById(session.projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${session.projectId}' not found` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      project.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.CreateGateways,
      OrgPermissionSubjects.Gateway
    );

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
    // To be hit by gateways only
    if (actor.type !== ActorType.IDENTITY) {
      throw new ForbiddenRequestError({ message: "Only gateways can perform this action" });
    }

    const session = await pamSessionDAL.findById(sessionId);
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

    const project = await projectDAL.findById(session.projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${session.projectId}' not found` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      project.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.CreateGateways,
      OrgPermissionSubjects.Gateway
    );

    if (session.status === PamSessionStatus.Ended) {
      return {
        session,
        projectId: project.id
      };
    }

    if (session.status !== PamSessionStatus.Active) {
      throw new BadRequestError({ message: "Cannot end sessions that are not active" });
    }

    const updatedSession = await pamSessionDAL.updateById(sessionId, {
      endedAt: new Date(),
      status: PamSessionStatus.Ended
    });

    return { session: updatedSession, projectId: project.id };
  };

  return { getById, list, updateLogsById, endSessionById };
};
