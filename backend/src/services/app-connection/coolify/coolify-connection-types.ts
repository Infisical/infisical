import z from "zod";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { CoolifyResourceType } from "./coolify-connection-enums";
import {
  CoolifyConnectionSchema,
  CreateCoolifyConnectionSchema,
  ValidateCoolifyConnectionCredentialsSchema
} from "./coolify-connection-schemas";

export type TCoolifyConnection = z.infer<typeof CoolifyConnectionSchema>;

export type TCoolifyConnectionInput = z.infer<typeof CreateCoolifyConnectionSchema> & {
  app: AppConnection.Coolify;
};

export type TValidateCoolifyConnectionCredentialsSchema = typeof ValidateCoolifyConnectionCredentialsSchema;

export type TCoolifyConnectionConfig = DiscriminativePick<
  TCoolifyConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
>;

export type TCoolifyRequestConfig = Pick<TCoolifyConnectionConfig, "credentials" | "gatewayId" | "gatewayPoolId">;

export type TCoolifyGatewayDeps = {
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

export type TCoolifyResource = {
  id: string;
  name: string;
  type: CoolifyResourceType;
  projectName: string;
  environmentName: string;
};
