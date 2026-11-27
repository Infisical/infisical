import { TActorInput } from "@app/lib/types";

export type TCreateProjectFolderGrantDTO = TActorInput & {
  sourceProjectId: string;
  environment: string;
  secretPath: string;
  targetProjectId: string;
};

export type TDeleteProjectFolderGrantDTO = TActorInput & {
  grantId: string;
  sourceProjectId: string;
};

export type TListProjectFolderGrantsDTO = TActorInput & {
  sourceProjectId: string;
};

export type TListProjectFolderGrantsForTargetDTO = TActorInput & {
  targetProjectId: string;
};

export type TGetGrantUsageDTO = TActorInput & {
  grantId: string;
  sourceProjectId: string;
};

export type TCheckRevokedGrantsDTO = {
  targetProjectId: string;
  actorOrgId: string;
  secrets: Array<{ id: string; secretValue?: string | null; secretValueHidden?: boolean }>;
};
