import { UserWsKeyPair } from "../keys/types";
import { EncryptedSecret } from "../secrets/types";

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
};

export type TGetSecretImports = {
  workspaceId: string;
  environment: string;
  directory?: string;
};

export type TGetImportedSecrets = {
  workspaceId: string;
  environment: string;
  directory?: string;
  decryptFileKey: UserWsKeyPair;
};

export type TCreateSecretImportDTO = {
  workspaceId: string;
  environment: string;
  directory?: string;
  secretImport: {
    environment: string;
    secretPath: string;
  };
};

export type TUpdateSecretImportDTO = {
  id: string;
  workspaceId: string;
  environment: string;
  directory?: string;
  secretImports: Array<{
    environment: string;
    secretPath: string;
  }>;
};

export type TDeleteSecretImportDTO = {
  id: string;
  workspaceId: string;
  environment: string;
  directory?: string;
  secretImportPath: string;
  secretImportEnv: string;
};
