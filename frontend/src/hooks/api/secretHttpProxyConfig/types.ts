export enum ProxyAuthType {
  Bearer = "bearer",
  Basic = "basic",
  ApiKey = "api-key",
  Custom = "custom",
  Passthrough = "passthrough"
}

export enum SubstitutionSurface {
  Path = "path",
  Query = "query",
  Header = "header",
  Body = "body"
}

export type TProxySubstitution = {
  key: string;
  placeholder: string;
  in?: SubstitutionSurface[];
};

export type TProxyRule = {
  host: string;
  authType: ProxyAuthType;
  headerName?: string;
  username?: string;
  headerTemplate?: string;
  substitutions?: TProxySubstitution[];
};

export type TSecretHttpProxyConfig = {
  id: string;
  secretId: string;
  placeholder: string;
  rules: TProxyRule[];
  createdAt: string;
  updatedAt: string;
};

export type TGetSecretHttpProxyConfigDTO = {
  projectId: string;
  secretId: string;
};

export type TUpsertSecretHttpProxyConfigDTO = {
  projectId: string;
  secretId: string;
  placeholder?: string;
  rules: TProxyRule[];
};

export type TDeleteSecretHttpProxyConfigDTO = {
  projectId: string;
  secretId: string;
};
