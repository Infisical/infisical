import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

type TBaseActor = {
  actorId: string;
  actor: ActorType;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
};

export type TCreateProjectGrantDTO = TBaseActor & {
  sourceProjectId: string;
  environment: string;
  secretPath: string;
  targetProjectId: string;
};

export type TDeleteProjectGrantDTO = TBaseActor & {
  grantId: string;
  sourceProjectId: string;
};

export type TListProjectGrantsDTO = TBaseActor & {
  sourceProjectId: string;
};
