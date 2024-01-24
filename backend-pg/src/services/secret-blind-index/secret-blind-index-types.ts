import { TProjectPermission } from "@app/lib/types";

export type TGetProjectBlindIndexStatusDTO = TProjectPermission;

export type TGetProjectSecretsDTO = TProjectPermission;

export type TUpdateProjectSecretNameDTO = TProjectPermission & {
  secretsToUpdate: {
    secretName: string;
    secretId: string;
  }[];
};
