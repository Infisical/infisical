import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  ADCSConnectionSchema,
  CreateADCSConnectionSchema,
  ValidateADCSConnectionCredentialsSchema
} from "./adcs-connection-schemas";

export type TADCSConnection = z.infer<typeof ADCSConnectionSchema>;

export type TADCSConnectionInput = z.infer<typeof CreateADCSConnectionSchema> & {
  app: AppConnection.ADCS;
};

export type TValidateADCSConnectionCredentialsSchema = typeof ValidateADCSConnectionCredentialsSchema;

export type TADCSConnectionConfig = DiscriminativePick<
  TADCSConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
>;
