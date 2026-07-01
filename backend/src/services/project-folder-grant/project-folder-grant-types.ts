import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

type TBaseActor = {
  actorId: string;
  actor: ActorType;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
};

export type TCreateProjectFolderGrantDTO = TBaseActor & {
  sourceProjectId: string;
  environment: string;
  secretPath: string;
  targetProjectId: string;
};

export type TDeleteProjectFolderGrantDTO = TBaseActor & {
  grantId: string;
  sourceProjectId: string;
};

export type TListProjectFolderGrantsDTO = TBaseActor & {
  sourceProjectId: string;
};

export type TListProjectFolderGrantsForTargetDTO = TBaseActor & {
  targetProjectId: string;
};

export type TCheckRevokedGrantsDTO = {
  targetProjectId: string;
  actorOrgId: string;
  secrets: Array<{ id: string; secretValue?: string | null; secretValueHidden?: boolean }>;
};
