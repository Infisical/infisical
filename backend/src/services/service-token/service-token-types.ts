import { TProjectPermission } from "@app/lib/types";

export type TCreateServiceTokenDTO = {
  name: string;
  scopes: Array<{ environment: string; secretPath: string }>;
  encryptedKey: string;
  iv: string;
  tag: string;
  expiresIn?: number | null;
  permissions: ("read" | "write")[];
} & TProjectPermission;

export type TGetServiceTokenInfoDTO = Omit<TProjectPermission, "projectId">;

export type TDeleteServiceTokenDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TProjectServiceTokensDTO = TProjectPermission;
