import { SecretKeyEncoding } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

export type TSetActiveStateDTO = {
  isActive: boolean;
  botKey?: {
    nonce?: string;
    encryptedKey?: string;
  };
  botId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetPrivateKeyDTO = {
  encoding: SecretKeyEncoding;
  nonce: string;
  tag: string;
  encryptedPrivateKey: string;
};
