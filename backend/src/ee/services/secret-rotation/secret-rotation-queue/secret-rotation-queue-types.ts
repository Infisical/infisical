import { TDbProviderClients } from "../templates/types";

export type TSecretRotationEncData = {
  inputs: Record<string, unknown>;
  creds: Array<{
    outputs: Record<string, unknown>;
    internal: Record<string, unknown>;
  }>;
};

export type TSecretRotationData = {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  internal: Record<string, unknown>;
};

export type TSecretRotationDbFn = {
  client: TDbProviderClients;
  username: string;
  password: string;
  host: string;
  database: string;
  port: number;
  query: string;
  variables: unknown[];
  ca?: string;
  options?: Record<string, unknown>;
};
