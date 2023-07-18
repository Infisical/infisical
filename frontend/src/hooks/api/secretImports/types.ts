import { EncryptedSecret } from "../secrets/types";
import { UserWsKeyPair } from "../types";

export type TSecretImports = {
  _id: string;
  workspaceId: string;
  environment: string;
  folderId: string;
  imports: Array<{ environment: string; secretPath: string }>;
  createdAt: string;
  updatedAt: string;
};

export type TImportedSecrets = {
  environment: string;
  secretPath: string;
  folderId: string;
  secrets: EncryptedSecret[];
}[];

export type TGetImportedSecrets = {
  workspaceId: string;
  environment: string;
  folderId?: string;
  decryptFileKey: UserWsKeyPair;
};

export type TCreateSecretImportDTO = {
  workspaceId: string;
  environment: string;
  folderId?: string;
  secretImport: {
    environment: string;
    secretPath: string;
  };
};

export type TUpdateSecretImportDTO = {
  id: string;
  workspaceId: string;
  environment: string;
  folderId?: string;
  secretImports: Array<{
    environment: string;
    secretPath: string;
  }>;
};

export type TDeleteSecretImportDTO = {
  id: string;
  workspaceId: string;
  environment: string;
  folderId?: string;
  secretImportPath: string;
  secretImportEnv: string;
};
