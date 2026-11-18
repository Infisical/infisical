import { TActorInput } from "@app/lib/types";

export type TCreateServiceTokenDTO = {
  name: string;
  scopes: Array<{ environment: string; secretPath: string }>;
  encryptedKey: string;
  iv: string;
  tag: string;
  expiresIn?: number | null;
  permissions: ("read" | "write")[];
  projectId: string;
} & TActorInput;

export type TGetServiceTokenInfoDTO = TActorInput;

export type TDeleteServiceTokenDTO = {
  id: string;
} & TActorInput;

export type TProjectServiceTokensDTO = { projectId: string } & TActorInput;
