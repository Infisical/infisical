import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateHpeIloConnectionSchema,
  HpeIloConnectionSchema,
  ValidateHpeIloConnectionCredentialsSchema
} from "./hpe-ilo-connection-schemas";

export type THpeIloConnection = z.infer<typeof HpeIloConnectionSchema>;

export type THpeIloConnectionInput = z.infer<typeof CreateHpeIloConnectionSchema> & {
  app: AppConnection.HpeIloRedFish;
};

export type TValidateHpeIloConnectionCredentialsSchema = typeof ValidateHpeIloConnectionCredentialsSchema;

export type THpeIloConnectionConfig = DiscriminativePick<
  THpeIloConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
> & {
  orgId: string;
};
