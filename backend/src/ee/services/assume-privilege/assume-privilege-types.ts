import type { TActorContext } from "@app/domains/lib/actor-context";
import { ActorType } from "@app/lib/auth/actor-types";

export type TAssumeProjectPrivilegeDTO = {
  targetActorType: ActorType.USER | ActorType.IDENTITY;
  targetActorId: string;
  projectId: string;
  tokenVersionId: string;
  actor: TActorContext;
};

export interface TAssumePrivilegeServiceFactory {
  assumeProjectPrivileges: ({
    targetActorType,
    targetActorId,
    projectId,
    actor,
    tokenVersionId
  }: TAssumeProjectPrivilegeDTO) => Promise<{
    actorType: ActorType.USER | ActorType.IDENTITY;
    actorId: string;
    projectId: string;
    assumePrivilegesToken: string;
  }>;
  verifyAssumePrivilegeToken: (
    token: string,
    tokenVersionId: string,
    actorOrgId: string
  ) => Promise<{
    tokenVersionId: string;
    projectId: string;
    requesterId: string;
    actorType: ActorType;
    actorId: string;
  }>;
}
