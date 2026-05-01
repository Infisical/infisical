import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateVenafiTppConnectionSchema,
  ValidateVenafiTppConnectionCredentialsSchema,
  VenafiTppConnectionSchema
} from "./venafi-tpp-connection-schemas";

export type TVenafiTppConnection = z.infer<typeof VenafiTppConnectionSchema>;

export type TVenafiTppConnectionInput = z.infer<typeof CreateVenafiTppConnectionSchema> & {
  app: AppConnection.VenafiTpp;
};

export type TValidateVenafiTppConnectionCredentialsSchema = typeof ValidateVenafiTppConnectionCredentialsSchema;

export type TVenafiTppConnectionConfig = DiscriminativePick<
  TVenafiTppConnectionInput,
  "method" | "app" | "credentials" | "gatewayId"
> & {
  orgId: string;
};
