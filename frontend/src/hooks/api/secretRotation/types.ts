import { WorkspaceEnv } from "../workspace/types";

export enum TProviderFunctionTypes {
  HTTP = "http",
  DB = "database"
}

export enum TDbProviderClients {
  // postgres, cockroack db, amazon red shift
  Pg = "pg",
  // mysql and maria db
  Sql = "sql"
}

export enum TAssignOp {
  Direct = "direct",
  JmesPath = "jmesopath"
}

export type TJmesPathAssignOp = {
  assign: TAssignOp.JmesPath;
  path: string;
};

export type TDirectAssignOp = {
  assign: TAssignOp.Direct;
  value: string;
};

export type TAssignFunction = TJmesPathAssignOp | TDirectAssignOp;

export type THttpProviderFunction = {
  url: string;
  method: string;
  header?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  setter?: Record<string, TAssignFunction>;
  pre?: Record<string, TDirectAssignOp>;
};

export type TSecretRotationProviderTemplate = {
  name: string;
  title: string;
  image?: string;
  description?: string;
  template: THttpProviderTemplate | TDbProviderTemplate;
  isDeprecated?: boolean;
};

export type THttpProviderTemplate = {
  type: TProviderFunctionTypes.HTTP;
  inputs: {
    type: "object";
    properties: Record<string, { type: string; [x: string]: unknown; desc?: string }>;
    required: string[];
  };
  outputs: Record<string, unknown>;
  functions: {
    set: THttpProviderFunction;
    remove?: THttpProviderFunction;
    test: THttpProviderFunction;
  };
};

export type TDbProviderTemplate = {
  type: TProviderFunctionTypes.DB;
  inputs: {
    type: "object";
    properties: Record<string, { type: string; [x: string]: unknown; desc?: string }>;
    required: string[];
  };
  outputs: Record<string, unknown>;
};

export type TSecretRotation = {
  id: string;
  interval: number;
  provider: string;
  customProvider: string;
  workspace: string;
  envId: string;
  environment: WorkspaceEnv;
  secretPath: string;
  outputs: Array<{
    key: string;
    secret: {
      version: number;
      id: string;
      secretKey: string;
    };
  }>;
  status?: "success" | "failed";
  lastRotatedAt?: string;
  statusMessage?: string;
  algorithm: string;
  keyEncoding: string;
};

export type TSecretRotationProviderList = {
  custom: TSecretRotationProviderTemplate[];
  providers: TSecretRotationProviderTemplate[];
};

export type TGetSecretRotationProviders = {
  workspaceId: string;
};

export type TGetSecretRotationListDTO = {
  workspaceId: string;
};

export type TCreateSecretRotationDTO = {
  workspaceId: string;
  secretPath: string;
  environment: string;
  interval: number;
  provider: string;
  customProvider?: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, string>;
};

export type TDeleteSecretRotationDTO = {
  id: string;
  workspaceId: string;
};

export type TRestartSecretRotationDTO = {
  id: string;
  workspaceId: string;
};
