import { ActorType } from "../auditLogs/enums";

export type TProjectAssumePrivilegesDTO = {
  projectId: string;
  actorType: ActorType;
  actorId: string;
};
