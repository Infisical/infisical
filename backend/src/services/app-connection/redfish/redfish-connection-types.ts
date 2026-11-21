import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateRedfishConnectionSchema,
  RedfishConnectionSchema,
  ValidateRedfishConnectionCredentialsSchema
} from "./redfish-connection-schemas";

export type TRedfishConnection = z.infer<typeof RedfishConnectionSchema>;

export type TRedfishConnectionInput = z.infer<typeof CreateRedfishConnectionSchema> & {
  app: AppConnection.Redfish;
};

export type TValidateRedfishConnectionCredentialsSchema = typeof ValidateRedfishConnectionCredentialsSchema;

export type TRedfishConnectionConfig = DiscriminativePick<
  TRedfishConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
> & {
  orgId: string;
};
