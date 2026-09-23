import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { ForbiddenRequestError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { ActorType } from "@app/services/auth/auth-type";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "../permission/project-permission";
import { TAssumePrivilegeServiceFactory } from "./assume-privilege-types";

type TAssumePrivilegeServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  userDAL: Pick<TUserDALFactory, "findById">;
};

export const assumePrivilegeServiceFactory = ({
  permissionService,
  userDAL
}: TAssumePrivilegeServiceFactoryDep): TAssumePrivilegeServiceFactory => {
  const $getMemberSubject = async (userId: string) => {
    const user = await requestMemoize(requestMemoKeys.userFindById(userId), () => userDAL.findById(userId));
    return subject(ProjectPermissionSub.Member, { userEmail: user?.email ?? undefined });
  };

  const assumeProjectPrivileges: TAssumePrivilegeServiceFactory["assumeProjectPrivileges"] = async ({
    targetActorType,
    targetActorId,
    projectId,
    actorPermissionDetails,
    tokenVersionId
  }) => {
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
        await $getMemberSubject(targetActorId)
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.AssumePrivileges,
        subject(ProjectPermissionSub.Identity, { identityId: targetActorId })
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

  const verifyAssumePrivilegeToken: TAssumePrivilegeServiceFactory["verifyAssumePrivilegeToken"] = async (
    token,
    tokenVersionId,
    actorAuthMethod,
    actorOrgId
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

    const requesterPermission = await permissionService.getProjectPermission({
      actor: ActorType.USER,
      actorId: decodedToken.requesterId,
      projectId: decodedToken.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    if (decodedToken.actorType === ActorType.USER) {
      ForbiddenError.from(requesterPermission.permission).throwUnlessCan(
        ProjectPermissionMemberActions.AssumePrivileges,
        await $getMemberSubject(decodedToken.actorId)
      );
    } else {
      ForbiddenError.from(requesterPermission.permission).throwUnlessCan(
        ProjectPermissionIdentityActions.AssumePrivileges,
        subject(ProjectPermissionSub.Identity, { identityId: decodedToken.actorId })
      );
    }

    return decodedToken;
  };

  return {
    assumeProjectPrivileges,
    verifyAssumePrivilegeToken
  };
};
