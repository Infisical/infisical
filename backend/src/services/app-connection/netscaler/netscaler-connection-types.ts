import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateNetScalerConnectionSchema,
  NetScalerConnectionSchema,
  ValidateNetScalerConnectionCredentialsSchema
} from "./netscaler-connection-schemas";

export type TNetScalerConnection = z.infer<typeof NetScalerConnectionSchema>;

export type TNetScalerConnectionInput = z.infer<typeof CreateNetScalerConnectionSchema> & {
  app: AppConnection.NetScaler;
};

export type TValidateNetScalerConnectionCredentialsSchema = typeof ValidateNetScalerConnectionCredentialsSchema;

export type TNetScalerConnectionConfig = DiscriminativePick<
  TNetScalerConnectionInput,
  "method" | "app" | "credentials" | "gatewayId"
> & {
  orgId: string;
};
