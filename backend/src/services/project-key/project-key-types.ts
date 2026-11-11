import { TActorInput } from "@app/lib/types";

export type TGetLatestProjectKeyDTO = { projectId: string } & TActorInput;

export type TUploadProjectKeyDTO = {
  encryptedKey: string;
  nonce: string;
  receiverId: string;
  projectId: string;
} & TActorInput;
