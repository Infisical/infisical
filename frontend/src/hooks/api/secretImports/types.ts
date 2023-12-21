import { UserWsKeyPair } from "../keys/types";
import { EncryptedSecret } from "../secrets/types";

export type TSecretImport = {
  id: string;
  folderId: string;
  importPath: string;
  importEnv: {
    name: string;
    slug: string;
    id: string;
  };
  position: string;
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
  projectId: string;
  environment: string;
  path?: string;
};

export type TGetImportedSecrets = {
  projectId: string;
  environment: string;
  path?: string;
  decryptFileKey: UserWsKeyPair;
};

export type TCreateSecretImportDTO = {
  projectId: string;
  environment: string;
  path?: string;
  import: {
    environment: string;
    path: string;
  };
};

export type TUpdateSecretImportDTO = {
  id: string;
  projectId: string;
  environment: string;
  path?: string;
  import: Partial<{
    environment: string;
    path: string;
    position: number;
  }>;
};

export type TDeleteSecretImportDTO = {
  id: string;
  projectId: string;
  environment: string;
  path?: string;
};
