import { ActorAuthMethod, ActorType } from "../auth/auth-type";

export type InfisicalImportData = {
  projects: Map<string, { name: string; id: string }>;

  environments?: Map<
    string,
    {
      name: string;
      id: string;
      projectId: string;
    }
  >;

  secrets?: Map<
    string,
    {
      name: string;
      id: string;
      environmentId: string;
      value?: string;
    }
  >;
};

export type TImportEnvKeyDataCreate = {
  decryptionKey: string;
  encryptedJson: { nonce: string; data: string };
  actor: ActorType;
  actorId: string;
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
};

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
    settings: {
      auth: {
        inviteExpirationMs: number;
        deviceGrantExpirationMs: number;
        tokenExpirationMs: number;
      };
      crypto: {
        requiresPassphrase: boolean;
        requiresLockout: boolean;
      };
      envs: {
        autoCaps: boolean;
        autoCommitLocals: boolean;
      };
    };
  };
  apps: {
    id: string;
    name: string;
    settings: Record<string, unknown>;
  }[];
  defaultOrgRoles: {
    id: string;
    defaultName: string;
  }[];
  defaultAppRoles: {
    id: string;
    defaultName: string;
  }[];
  defaultEnvironmentRoles: {
    id: string;
    defaultName: string;
    settings: {
      autoCommit: boolean;
    };
  }[];
  baseEnvironments: {
    id: string;
    envParentId: string;
    environmentRoleId: string;
    settings: Record<string, unknown>;
  }[];
  orgUsers: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    provider: string;
    orgRoleId: string;
    uid: string;
  }[];
  envs: Record<
    string,
    {
      variables: Record<string, { val: string }>;
      inherits: Record<string, unknown>;
    }
  >;
};
