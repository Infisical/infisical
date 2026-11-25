export enum DynamicSecretUserCredentialStatus {
  Active = "active",
  ReauthorizationRequired = "reauthorization-required"
}

export type TDynamicSecretUserCredential = {
  id: string;
  dynamicSecretId: string;
  externalUserId: string;
  accessTokenExpiresAt?: string | null;
  status: DynamicSecretUserCredentialStatus;
  statusDetails?: string | null;
  lastRefreshedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type TDynamicSecretLocation = {
  dynamicSecretName: string;
  projectSlug: string;
  environmentSlug: string;
  path: string;
};

export type TListDynamicSecretUserCredentialsDTO = TDynamicSecretLocation & {
  offset: number;
  limit: number;
  enabled?: boolean;
};

export type TDeleteDynamicSecretUserCredentialDTO = TDynamicSecretLocation & {
  externalUserId: string;
};
