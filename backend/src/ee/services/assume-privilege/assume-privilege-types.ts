import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

export type TAssumeProjectPrivilegeDTO = {
  actorType: ActorType.USER | ActorType.IDENTITY;
  actorId: string;
  projectId: string;
  tokenVersionId: string;
  projectPermission: OrgServiceActor;
};
