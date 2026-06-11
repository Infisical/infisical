import { TProjectPermission } from "@app/lib/types";

export enum ProxyAuthType {
  Bearer = "bearer",
  Basic = "basic",
  ApiKey = "api-key",
  Custom = "custom"
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

export type TGetSecretHttpProxyConfigDTO = {
  secretId: string;
} & TProjectPermission;

export type TUpsertSecretHttpProxyConfigDTO = {
  secretId: string;
  placeholder?: string;
  rules: TProxyRule[];
} & TProjectPermission;

export type TDeleteSecretHttpProxyConfigDTO = {
  secretId: string;
} & TProjectPermission;

export type TListSecretHttpProxyConfigsDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
} & Omit<TProjectPermission, "projectId">;
