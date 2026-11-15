import { z } from "zod";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { DiscriminativePick } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import {
  CreateDatabricksConnectionSchema,
  DatabricksConnectionSchema,
  ValidateDatabricksConnectionCredentialsSchema
} from "./databricks-connection-schemas";

export type TDatabricksConnection = z.infer<typeof DatabricksConnectionSchema>;

export type TDatabricksConnectionInput = z.infer<typeof CreateDatabricksConnectionSchema> & {
  app: AppConnection.Databricks;
};

export type TValidateDatabricksConnectionCredentialsSchema = typeof ValidateDatabricksConnectionCredentialsSchema;

export type TDatabricksConnectionConfig = DiscriminativePick<
  TDatabricksConnection,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
> & {
  orgId: string;
};

export type TDatabricksRequestConfig = Pick<TDatabricksConnectionConfig, "credentials" | "gatewayId" | "gatewayPoolId">;

export type TDatabricksGatewayDeps = {
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

export type TAuthorizeDatabricksConnection = {
  access_token: string;
  scope: string;
  token_type: string;
  expires_in: number;
};

export type TDatabricksListSecretScopesResponse = {
  scopes?: { name: string; backend_type: string; keyvault_metadata: { resource_id: string; dns_name: string } }[];
};

export type TDatabricksServicePrincipal = {
  id: string;
  displayName: string;
  applicationId?: string;
  active?: boolean;
};

export type TDatabricksListServicePrincipalsResponse = {
  Resources?: TDatabricksServicePrincipal[];
  totalResults?: number;
  itemsPerPage?: number;
  startIndex?: number;
};
