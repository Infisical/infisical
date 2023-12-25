import { TProjectPermission } from "@app/lib/types";

export type TSetActiveStateDTO = {
  isActive: boolean;
  botKey?: {
    nonce?: string;
    encryptionKey?: string;
  };
  botId: string;
} & Omit<TProjectPermission, "projectId">;
