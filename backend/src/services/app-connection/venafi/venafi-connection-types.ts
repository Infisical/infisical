import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateVenafiConnectionSchema,
  ValidateVenafiConnectionCredentialsSchema,
  VenafiConnectionSchema
} from "./venafi-connection-schema";

export type TVenafiConnection = z.infer<typeof VenafiConnectionSchema>;

export type TVenafiConnectionInput = z.infer<typeof CreateVenafiConnectionSchema> & {
  app: AppConnection.Venafi;
};

export type TValidateVenafiConnectionCredentialsSchema = typeof ValidateVenafiConnectionCredentialsSchema;

export type TVenafiConnectionConfig = DiscriminativePick<TVenafiConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
