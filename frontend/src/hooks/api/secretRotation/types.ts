import { UserWsKeyPair } from "../keys/types";
import { EncryptedSecret } from "../secrets/types";

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
  type: TProviderFunctionTypes.HTTP;
  url: string;
  method: string;
  header?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  setter?: Record<string, TAssignFunction>;
  pre?: Record<string, TDirectAssignOp>;
};

export type TDbProviderFunction = {
  type: TProviderFunctionTypes.DB;
  client: TDbProviderClients;
  username: string;
  password: string;
  host: string;
  database: string;
  port: string;
  query: string;
  setter?: Record<string, TAssignFunction>;
  pre?: Record<string, TDirectAssignOp>;
};

export type TProviderFunction = THttpProviderFunction | TDbProviderFunction;

export type TProviderTemplate = {
  inputs: {
    properties: Record<string, { type: string; helperText?: string; defaultValue?: string }>;
    type: "object";
    required: string[];
  };
  outputs: Record<string, unknown>;
  functions: {
    set: TProviderFunction;
    remove?: TProviderFunction;
    test: TProviderFunction;
  };
};

export type TSecretRotation<T extends unknown = EncryptedSecret> = {
  _id: string;
  interval: number;
  provider: string;
  customProvider: string;
  workspace: string;
  environment: string;
  secretPath: string;
  outputs: Array<{
    key: string;
    secret: T;
  }>;
  status?: "success" | "failed";
  lastRotatedAt?: string;
  statusMessage?: string;
  algorithm: string;
  keyEncoding: string;
};

export type TSecretRotationProvider = {
  name: string;
  image: string;
  title: string;
  description: string;
  template: TProviderTemplate;
};

export type TSecretRotationProviderList = {
  custom: TSecretRotationProvider[];
  providers: TSecretRotationProvider[];
};

export type TGetSecretRotationProviders = {
  workspaceId: string;
};

export type TGetSecretRotationList = {
  workspaceId: string;
  decryptFileKey: UserWsKeyPair;
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
