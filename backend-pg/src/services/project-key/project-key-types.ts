import { TProjectPermission } from "@app/lib/types";

export type TGetLatestProjectKeyDTO = TProjectPermission;

export type TUploadProjectKeyDTO = {
  encryptedKey: string;
  nonce: string;
  receiverId: string;
} & TProjectPermission;
