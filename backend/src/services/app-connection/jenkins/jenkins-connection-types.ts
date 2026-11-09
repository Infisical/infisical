import z from "zod";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateJenkinsConnectionSchema,
  JenkinsConnectionSchema,
  ValidateJenkinsConnectionCredentialsSchema
} from "./jenkins-connection-schemas";

export type TJenkinsConnection = z.infer<typeof JenkinsConnectionSchema>;

export type TJenkinsConnectionInput = z.infer<typeof CreateJenkinsConnectionSchema> & {
  app: AppConnection.Jenkins;
};

export type TValidateJenkinsConnectionCredentialsSchema = typeof ValidateJenkinsConnectionCredentialsSchema;

export type TJenkinsConnectionConfig = DiscriminativePick<
  TJenkinsConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
>;

export type TJenkinsRequestConfig = Pick<TJenkinsConnectionConfig, "credentials" | "gatewayId" | "gatewayPoolId">;

export type TJenkinsGatewayDeps = {
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

export type TJenkinsFolder = {
  name: string;
  fullName: string;
};
