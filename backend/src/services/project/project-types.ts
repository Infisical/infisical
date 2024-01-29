import { ActorType } from "../auth/auth-type";

export type TCreateProjectDTO = {
  actor: ActorType;
  actorId: string;
  orgId: string;
  workspaceName: string;
};

export type TDeleteProjectDTO = {
  actor: ActorType;
  actorId: string;
  projectId: string;
};

export type TGetProjectDTO = {
  actor: ActorType;
  actorId: string;
  projectId: string;
};
