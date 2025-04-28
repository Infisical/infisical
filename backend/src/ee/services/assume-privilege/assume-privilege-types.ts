import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

export type TAssumeProjectPrivilegeDTO = {
  targetActorType: ActorType.USER | ActorType.IDENTITY;
  targetActorId: string;
  projectId: string;
  tokenVersionId: string;
  actorPermissionDetails: OrgServiceActor;
};
