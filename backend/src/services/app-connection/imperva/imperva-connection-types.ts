import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateImpervaConnectionSchema,
  ImpervaConnectionSchema,
  ValidateImpervaConnectionCredentialsSchema
} from "./imperva-connection-schemas";

export type TImpervaConnection = z.infer<typeof ImpervaConnectionSchema>;

export type TImpervaConnectionInput = z.infer<typeof CreateImpervaConnectionSchema> & {
  app: AppConnection.Imperva;
};

export type TValidateImpervaConnectionCredentialsSchema = typeof ValidateImpervaConnectionCredentialsSchema;

export type TImpervaConnectionConfig = DiscriminativePick<
  TImpervaConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
> & {
  orgId: string;
};
