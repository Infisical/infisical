import { Document, Types } from "mongoose";

export interface ISecretRotation extends Document {
  _id: Types.ObjectId;
  name: string;
  interval: number;
  provider: string;
  customProvider: Types.ObjectId;
  workspace: Types.ObjectId;
  environment: string;
  secretPath: string;
  outputs: Array<{
    key: string;
    secret: Types.ObjectId;
  }>;
  status?: "success" | "failed";
  lastRotatedAt?: string;
  statusMessage?: string;
  encryptedData: string;
  encryptedDataIV: string;
  encryptedDataTag: string;
  algorithm: string;
  keyEncoding: string;
}

export type ISecretRotationEncData = {
  inputs: Record<string, unknown>;
  creds: Array<{
    outputs: Record<string, unknown>;
    internal: Record<string, unknown>;
  }>;
};

export type ISecretRotationData = {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  internal: Record<string, unknown>;
};

export type ISecretRotationProviderTemplate = {
  name: string;
  title: string;
  image?: string;
  description?: string;
  template: TProviderTemplate;
};

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
    type: "object";
    properties: Record<string, { type: string; [x: string]: unknown; desc?: string }>;
    required?: string[];
  };
  outputs: Record<string, unknown>;
  functions: {
    set: TProviderFunction;
    remove?: TProviderFunction;
    test: TProviderFunction;
  };
};

// function type args
export type TGetProviderTemplates = {
  workspaceId: string;
};

export type TCreateSecretRotation = {
  provider: string;
  customProvider?: string;
  workspaceId: string;
  secretPath: string;
  environment: string;
  interval: number;
  inputs: Record<string, unknown>;
  outputs: Record<string, string>;
};
