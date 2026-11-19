import z from "zod";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { PortainerStackType } from "./portainer-connection-enums";
import {
  CreatePortainerConnectionSchema,
  PortainerConnectionSchema,
  ValidatePortainerConnectionCredentialsSchema
} from "./portainer-connection-schemas";

export type TPortainerConnection = z.infer<typeof PortainerConnectionSchema>;

export type TPortainerConnectionInput = z.infer<typeof CreatePortainerConnectionSchema> & {
  app: AppConnection.Portainer;
};

export type TValidatePortainerConnectionCredentialsSchema = typeof ValidatePortainerConnectionCredentialsSchema;

export type TPortainerConnectionConfig = DiscriminativePick<
  TPortainerConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
>;

export type TPortainerRequestConfig = Pick<TPortainerConnectionConfig, "credentials" | "gatewayId" | "gatewayPoolId">;

export type TPortainerGatewayDeps = {
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

export type TPortainerEnvironment = {
  id: number;
  name: string;
};

export type TPortainerStack = {
  id: number;
  name: string;
  environmentId: number;
  isGitBased: boolean;
};

export type TPortainerEnvVar = {
  name: string;
  value: string;
};

export type TPortainerStackResponse = {
  Id: number;
  Name: string;
  Type: PortainerStackType;
  EndpointId: number;
  Env?: TPortainerEnvVar[] | null;
  Option?: {
    Prune?: boolean;
  } | null;
  // Business Edition only; an update that leaves either of them out clears it
  Registries?: number[] | null;
  Webhook?: string | null;
  // Set on Portainer 2.45+, where the Git settings live on a Source instead of the stack
  WorkflowID?: number;
  GitSourceId?: number;
  GitConfig?: {
    URL: string;
    ReferenceName?: string;
    ConfigFilePath?: string;
    TLSSkipVerify?: boolean;
    Authentication?: {
      Username?: string;
      Password?: string;
      // A stack that authenticates through a saved credential carries its ID instead of a password
      GitCredentialID?: number;
      AuthorizationType?: number;
      Provider?: number;
    } | null;
  } | null;
  AutoUpdate?: {
    Interval?: string;
    Webhook?: string;
    JobID?: string;
    ForceUpdate?: boolean;
    ForcePullImage?: boolean;
  } | null;
};
