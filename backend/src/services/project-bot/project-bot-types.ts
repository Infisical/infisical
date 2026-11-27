import { TProjectBots } from "@app/db/schemas";
import { TActorInput } from "@app/lib/types";

export type TSetActiveStateDTO = {
  isActive: boolean;
  botKey?: {
    nonce?: string;
    encryptedKey?: string;
  };
  botId: string;
} & TActorInput;

export type TFindBotByProjectIdDTO = {
  privateKey?: string;
  publicKey?: string;
  botKey?: {
    nonce: string;
    encryptedKey: string;
  };
  projectId: string;
} & TActorInput;

export type TGetPrivateKeyDTO = {
  bot: TProjectBots;
};
