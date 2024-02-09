// import { SecretKeyEncoding } from "@app/db/schemas";
import { TProjectBots } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

export type TSetActiveStateDTO = {
  isActive: boolean;
  botKey?: {
    nonce?: string;
    encryptedKey?: string;
  };
  botId: string;
} & Omit<TProjectPermission, "projectId">;

export type TFindBotByProjectIdDTO = {
  privateKey?: string;
  publicKey?: string;
  botKey?: {
    nonce: string;
    encryptedKey: string;
  };
} & TProjectPermission;

export type TGetPrivateKeyDTO = {
  //   encoding: SecretKeyEncoding;
  //   nonce: string;
  //   tag: string;
  //   encryptedPrivateKey: string;

  bot: TProjectBots;
};
