import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";

import { ActionProjectType } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TPermissionServiceFactory } from "../permission/permission-service";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "../permission/project-permission";
import { TAssumeProjectPrivilegeDTO } from "./assume-privilege-types";

type TAssumePrivilegeServiceFactoryDep = {
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TAssumePrivilegeServiceFactory = ReturnType<typeof assumePrivilegeServiceFactory>;

export const assumePrivilegeServiceFactory = ({ projectDAL, permissionService }: TAssumePrivilegeServiceFactoryDep) => {
  const assumeProjectPrivileges = async ({
    actorType,
    actorId,
    projectId,
    projectPermission,
    tokenVersionId
  }: TAssumeProjectPrivilegeDTO) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    const { permission } = await permissionService.getProjectPermission({
      actor: projectPermission.type,
      actorId: projectPermission.id,
      projectId,
      actorAuthMethod: projectPermission.authMethod,
      actorOrgId: projectPermission.orgId,
      actionProjectType: ActionProjectType.Any
    });
    if (actorType === ActorType.USER) {
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
      actor: actorType,
      actorId,
      projectId,
      actorAuthMethod: projectPermission.authMethod,
      actorOrgId: projectPermission.orgId,
      actionProjectType: ActionProjectType.Any
    });

    const appCfg = getConfig();
    const assumePrivilegesToken = jwt.sign(
      {
        tokenVersionId,
        actorType,
        actorId,
        projectId,
        userId: projectPermission.id
      },
      appCfg.AUTH_SECRET,
      { expiresIn: "1hr" }
    );

    return { actorType, actorId, projectId, assumePrivilegesToken };
  };

  const verifyAssumePrivilegeToken = (token: string, tokenVersionId: string) => {
    const appCfg = getConfig();
    const decodedToken = jwt.verify(token, appCfg.AUTH_SECRET) as {
      tokenVersionId: string;
      projectId: string;
      userId: string;
      actorType: ActorType;
      actorId: string;
    };
    if (decodedToken.tokenVersionId !== tokenVersionId) return;
    return decodedToken;
  };

  return {
    assumeProjectPrivileges,
    verifyAssumePrivilegeToken
  };
};
