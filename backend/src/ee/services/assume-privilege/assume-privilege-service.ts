import type { TActorContexts } from "@app/domains/lib/actor-context";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  TProjectsDomain
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
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  actorContexts: Pick<TActorContexts, "forPrincipal">;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
};

export const assumePrivilegeServiceFactory = ({
  projectsDomain,
  actorContexts,
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
    const permission = await projectsDomain.getProjectPermission({ actor, projectId });

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

    // check entity is  part of project; only membership is read here, so the principal needs no profile
    const targetActor = await actorContexts.forPrincipal(
      targetActorType === ActorType.USER
        ? {
            type: ActorType.USER,
            id: targetActorId,
            username: "",
            email: null,
            authMethod: null,
            isSuperAdmin: false
          }
        : { type: ActorType.IDENTITY, id: targetActorId, name: "", isInstanceAdmin: false },
      actor.org.id
    );
    await projectsDomain.getProjectPermission({ actor: targetActor, projectId });

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
      { actorContexts, userDAL, identityDAL },
      { target: { type: ActorType.USER, id: decodedToken.requesterId }, orgId: actorOrgId }
    );
    const requesterPermission = await projectsDomain.getProjectPermission({
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

    return decodedToken;
  };

  return {
    assumeProjectPrivileges,
    verifyAssumePrivilegeToken
  };
};
