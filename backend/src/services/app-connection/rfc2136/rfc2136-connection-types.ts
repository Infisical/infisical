import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateRfc2136ConnectionSchema,
  Rfc2136ConnectionSchema,
  ValidateRfc2136ConnectionCredentialsSchema
} from "./rfc2136-connection-schemas";

export type TRfc2136Connection = z.infer<typeof Rfc2136ConnectionSchema>;

export type TRfc2136ConnectionInput = z.infer<typeof CreateRfc2136ConnectionSchema> & {
  app: AppConnection.Rfc2136;
};

export type TValidateRfc2136ConnectionCredentialsSchema = typeof ValidateRfc2136ConnectionCredentialsSchema;

export type TRfc2136ConnectionConfig = DiscriminativePick<
  TRfc2136ConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
> & {
  orgId: string;
};
