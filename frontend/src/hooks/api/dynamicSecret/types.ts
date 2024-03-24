export enum DynamicSecretStatus {
  Deleting = "Revocation in process",
  FailedDeletion = "Failed to delete"
}
// TODO(akhilmhdh): When we switch to monorepo all the server api ts will be in a shared repo
export type TDynamicSecret = {
  id: string;
  slug: string;
  type: DynamicSecretProviders;
  createdAt: string;
  updatedAt: string;
  defaultTTL: string;
  status?: DynamicSecretStatus;
  statusDetails?: string;
  maxTTL: string;
};

export enum DynamicSecretProviders {
  SqlDatabase = "sql-database"
}

export enum SqlProviders {
  Postgres = "postgres"
}

export type TDynamicSecretProvider = {
  type: DynamicSecretProviders;
  inputs: {
    client: SqlProviders;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    creationStatement: string;
    revocationStatement: string;
    renewStatement: string;
    ca?: string | undefined;
  };
};

export type TCreateDynamicSecretDTO = {
  projectSlug: string;
  provider: TDynamicSecretProvider;
  defaultTTL: string;
  maxTTL?: string;
  path: string;
  environment: string;
  slug: string;
};

export type TUpdateDynamicSecretDTO = {
  slug: string;
  projectSlug: string;
  path: string;
  environment: string;
  data: {
    newSlug?: string;
    defaultTTL?: string;
    maxTTL?: string | null;
    inputs?: unknown;
  };
};

export type TListDynamicSecretDTO = {
  projectSlug: string;
  path: string;
  environment: string;
};

export type TDeleteDynamicSecretDTO = {
  projectSlug: string;
  path: string;
  environment: string;
  slug: string;
  isForced?: boolean;
};

export type TDetailsDynamicSecretDTO = {
  projectSlug: string;
  path: string;
  environment: string;
  slug: string;
};
