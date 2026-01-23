import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas/models";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "../permission/project-permission";
import { TAssumePrivilegeServiceFactory } from "./assume-privilege-types";

type TAssumePrivilegeServiceFactoryDep = {
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export const assumePrivilegeServiceFactory = ({
  projectDAL,
  permissionService
}: TAssumePrivilegeServiceFactoryDep): TAssumePrivilegeServiceFactory => {
  const assumeProjectPrivileges: TAssumePrivilegeServiceFactory["assumeProjectPrivileges"] = async ({
    targetActorType,
    targetActorId,
    projectId,
    actorPermissionDetails,
    tokenVersionId
  }) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    const { permission } = await permissionService.getProjectPermission({
      actor: actorPermissionDetails.type,
      actorId: actorPermissionDetails.id,
      projectId,
      actorAuthMethod: actorPermissionDetails.authMethod,
      actorOrgId: actorPermissionDetails.orgId,
      actionProjectType: ActionProjectType.Any
    });

    if (targetActorType === ActorType.USER) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionMemberActions.AssumePrivileges,
        ProjectPermissionSub.Member
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.AssumePrivileges,
        ProjectPermissionSub.Identity
      );
    }

    // check entity is  part of project
    await permissionService.getProjectPermission({
      actor: targetActorType,
      actorId: targetActorId,
      projectId,
      actorAuthMethod: actorPermissionDetails.authMethod,
      actorOrgId: actorPermissionDetails.orgId,
      actionProjectType: ActionProjectType.Any
    });

    const appCfg = getConfig();
    const assumePrivilegesToken = crypto.jwt().sign(
      {
        tokenVersionId,
        actorType: targetActorType,
        actorId: targetActorId,
        projectId,
        requesterId: actorPermissionDetails.id
      },
      appCfg.AUTH_SECRET,
      { expiresIn: "1hr" }
    );

    return { actorType: targetActorType, actorId: targetActorId, projectId, assumePrivilegesToken };
  };

  const verifyAssumePrivilegeToken: TAssumePrivilegeServiceFactory["verifyAssumePrivilegeToken"] = (
    token,
    tokenVersionId
  ) => {
    const appCfg = getConfig();
    const decodedToken = crypto.jwt().verify(token, appCfg.AUTH_SECRET) as {
      tokenVersionId: string;
      projectId: string;
      requesterId: string;
      actorType: ActorType;
      actorId: string;
    };
    if (decodedToken.tokenVersionId !== tokenVersionId) {
      throw new ForbiddenRequestError({ message: "Invalid token version" });
    }
    return decodedToken;
  };

  return {
    assumeProjectPrivileges,
    verifyAssumePrivilegeToken
  };
};
