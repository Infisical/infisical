import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

export type TAssumeProjectPrivilegeDTO = {
  targetActorType: ActorType.USER | ActorType.IDENTITY;
  targetActorId: string;
  projectId: string;
  tokenVersionId: string;
  actorPermissionDetails: OrgServiceActor;
};

export interface TAssumePrivilegeServiceFactory {
  assumeProjectPrivileges: ({
    targetActorType,
    targetActorId,
    projectId,
    actorPermissionDetails,
    tokenVersionId
  }: TAssumeProjectPrivilegeDTO) => Promise<{
    actorType: ActorType.USER | ActorType.IDENTITY;
    actorId: string;
    projectId: string;
    assumePrivilegesToken: string;
  }>;
  verifyAssumePrivilegeToken: (
    token: string,
    tokenVersionId: string
  ) => {
    tokenVersionId: string;
    projectId: string;
    requesterId: string;
    actorType: ActorType;
    actorId: string;
  };
}
