export enum TProviderFunctionTypes {
  HTTP = "http",
  DB = "database",
  AWS = "aws"
}

export enum TDbProviderClients {
  // postgres, cockroack db, amazon red shift
  Pg = "pg",
  // mysql and maria db
  MySql = "mysql",

  MsSqlServer = "mssql"
}

export enum TAwsProviderSystems {
  IAM = "iam"
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
  template: THttpProviderTemplate | TDbProviderTemplate | TAwsProviderTemplate;
  isDeprecated?: boolean;
};

export type THttpProviderTemplate = {
  type: TProviderFunctionTypes.HTTP;
  inputs: {
    type: "object";
    properties: Record<string, { type: string; [x: string]: unknown; desc?: string }>;
    required?: string[];
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
  client: TDbProviderClients;
  inputs: {
    type: "object";
    properties: Record<string, { type: string; [x: string]: unknown; desc?: string }>;
    required?: string[];
  };
  outputs: Record<string, unknown>;
};

export type TAwsProviderTemplate = {
  type: TProviderFunctionTypes.AWS;
  client: TAwsProviderSystems;
  inputs: {
    type: "object";
    properties: Record<string, { type: string; [x: string]: unknown; desc?: string }>;
    required?: string[];
  };
  outputs: Record<string, unknown>;
};
