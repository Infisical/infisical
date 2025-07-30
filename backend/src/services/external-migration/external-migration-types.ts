import { TOrgPermission } from "@app/lib/types";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";

export enum ImportType {
  EnvKey = "envkey",
  Vault = "vault"
}

export enum VaultMappingType {
  Namespace = "namespace",
  KeyVault = "key-vault"
}

export type InfisicalImportData = {
  projects: Array<{ name: string; id: string }>;
  environments: Array<{ name: string; id: string; projectId: string; envParentId?: string }>;
  folders: Array<{ id: string; name: string; environmentId: string; parentFolderId?: string }>;
  secrets: Array<{
    id: string;
    name: string;
    environmentId: string;
    value: string;
    folderId?: string;
    appBlockOrderIndex?: number; // Not used for infisical import, only used for building the import structure to determine which block(s) take precedence.
  }>;
};

export type TImportEnvKeyDataDTO = {
  decryptionKey: string;
  encryptedJson: { nonce: string; data: string };
} & Omit<TOrgPermission, "orgId">;

export type TImportVaultDataDTO = {
  vaultAccessToken: string;
  vaultNamespace?: string;
  mappingType: VaultMappingType;
  vaultUrl: string;
} & Omit<TOrgPermission, "orgId">;

export type TImportInfisicalDataCreate = {
  data: InfisicalImportData;
  actor: ActorType;
  actorId: string;
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
};

export type TEnvKeyExportJSON = {
  schemaVersion: string;
  org: {
    id: string;
    name: string;
  };

  // Apps are projects
  apps: {
    id: string;
    name: string;
  }[];
  // Blocks are basically global projects that can be imported in other projects
  blocks: {
    id: string;
    name: string;
  }[];

  appBlocks: {
    appId: string;
    blockId: string;
    orderIndex: number;
  }[];

  defaultEnvironmentRoles: {
    id: string;
    defaultName: string;
  }[];

  nonDefaultEnvironmentRoles: {
    id: string;
    name: string;
  }[];

  baseEnvironments: {
    id: string;
    envParentId: string;
    environmentRoleId: string;
  }[];

  // Branches for both blocks and apps
  subEnvironments: {
    id: string;
    envParentId: string;
    environmentRoleId: string;
    parentEnvironmentId: string;
    subName: string;
  }[];

  envs: Record<
    string,
    {
      variables: Record<
        string,
        {
          val?: string;
          inheritsEnvironmentId?: string;
        }
      >;

      inherits: Record<string, string[]>;
    }
  >;
};

export enum ExternalPlatforms {
  EnvKey = "EnvKey"
}
