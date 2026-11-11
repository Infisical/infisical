import { TActorInput } from "@app/lib/types";

export type TGetProjectBlindIndexStatusDTO = { projectId: string } & TActorInput;

export type TGetProjectSecretsDTO = { projectId: string } & TActorInput;

export type TUpdateProjectSecretNameDTO = { projectId: string } & TActorInput & {
    secretsToUpdate: {
      secretName: string;
      secretId: string;
    }[];
  };
