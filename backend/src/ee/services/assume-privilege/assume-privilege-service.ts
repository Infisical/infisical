import type { TActorContextService } from "@app/domains/platform/organizations/ce/module";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  TProjectPermissionService
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { ForbiddenRequestError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { buildMemberActorContext } from "@app/services/membership/membership-fns";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAssumePrivilegeServiceFactory } from "./assume-privilege-types";

type TAssumePrivilegeServiceFactoryDep = {
  projectPermissionService: TProjectPermissionService;
  actorContextService: TActorContextService;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
};

export const assumePrivilegeServiceFactory = ({
  projectPermissionService,
  actorContextService,
  userDAL,
  identityDAL
}: TAssumePrivilegeServiceFactoryDep): TAssumePrivilegeServiceFactory => {
  const $getMemberEmail = async (userId: string) => {
    const user = await requestMemoize(requestMemoKeys.userFindById(userId), () => userDAL.findById(userId));
    return user?.email ?? undefined;
  };

  const assumeProjectPrivileges: TAssumePrivilegeServiceFactory["assumeProjectPrivileges"] = async ({
    targetActorType,
    targetActorId,
    projectId,
    actor,
    tokenVersionId
  }) => {
    const permission = await projectPermissionService.getProjectPermission({ actor, projectId });

    if (targetActorType === ActorType.USER) {
      permission.assert({
        action: ProjectPermissionMemberActions.AssumePrivileges,
        subject: ProjectPermissionSub.Member
      });
    } else {
      permission.assert({
        action: ProjectPermissionIdentityActions.AssumePrivileges,
        subject: ProjectPermissionSub.Identity,
        fields: { identityId: targetActorId }
      });
    }

    // check entity is  part of project; only membership is read here, so the principal needs no profile. A user
    // target is checked against the org's sign-in policy with the requester's sign-in method.
    const targetActor =
      targetActorType === ActorType.USER
        ? await actorContextService.forSession({
            principal: {
              type: ActorType.USER,
              id: targetActorId,
              username: "",
              email: null,
              authMethod: actor.principal.type === ActorType.USER ? actor.principal.authMethod : null,
              isSuperAdmin: false
            },
            orgId: actor.org.id
          })
        : await actorContextService.forPrincipal({
            principal: { type: ActorType.IDENTITY, id: targetActorId, name: "", isInstanceAdmin: false },
            orgId: actor.org.id
          });
    await projectPermissionService.getProjectPermission({ actor: targetActor, projectId });

    if (targetActorType === ActorType.USER) {
      permission.assert({
        action: ProjectPermissionMemberActions.AssumePrivileges,
        subject: ProjectPermissionSub.Member,
        fields: { userEmail: await $getMemberEmail(targetActorId) }
      });
    }

    const appCfg = getConfig();
    const assumePrivilegesToken = crypto.jwt().sign(
      {
        tokenVersionId,
        actorType: targetActorType,
        actorId: targetActorId,
        projectId,
        requesterId: actor.principal.id
      },
      appCfg.AUTH_SECRET,
      { expiresIn: "1hr" }
    );

    return { actorType: targetActorType, actorId: targetActorId, projectId, assumePrivilegesToken };
  };

  const verifyAssumePrivilegeToken: TAssumePrivilegeServiceFactory["verifyAssumePrivilegeToken"] = async (
    token,
    tokenVersionId,
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

    const requester = await buildMemberActorContext(
      { actorContextService, userDAL, identityDAL },
      { target: { type: ActorType.USER, id: decodedToken.requesterId }, orgId: actorOrgId }
    );
    const requesterPermission = await projectPermissionService.getProjectPermission({
      actor: requester,
      projectId: decodedToken.projectId
    });

    if (decodedToken.actorType === ActorType.USER) {
      requesterPermission.assert({
        action: ProjectPermissionMemberActions.AssumePrivileges,
        subject: ProjectPermissionSub.Member,
        fields: { userEmail: await $getMemberEmail(decodedToken.actorId) }
      });
    } else {
      requesterPermission.assert({
        action: ProjectPermissionIdentityActions.AssumePrivileges,
        subject: ProjectPermissionSub.Identity,
        fields: { identityId: decodedToken.actorId }
      });
    }

    const actorName =
      decodedToken.actorType === ActorType.USER
        ? ((await userDAL.findById(decodedToken.actorId))?.username ?? "")
        : ((await identityDAL.findById(decodedToken.actorId))?.name ?? "");
    return { ...decodedToken, actorName };
  };

  return {
    assumeProjectPrivileges,
    verifyAssumePrivilegeToken
  };
};
