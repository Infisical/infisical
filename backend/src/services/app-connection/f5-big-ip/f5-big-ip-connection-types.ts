import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateF5BigIpConnectionSchema,
  F5BigIpConnectionSchema,
  ValidateF5BigIpConnectionCredentialsSchema
} from "./f5-big-ip-connection-schemas";

export type TF5BigIpConnection = z.infer<typeof F5BigIpConnectionSchema>;

export type TF5BigIpConnectionInput = z.infer<typeof CreateF5BigIpConnectionSchema> & {
  app: AppConnection.F5BigIp;
};

export type TValidateF5BigIpConnectionCredentialsSchema = typeof ValidateF5BigIpConnectionCredentialsSchema;

export type TF5BigIpConnectionConfig = DiscriminativePick<
  TF5BigIpConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
> & {
  orgId: string;
};
