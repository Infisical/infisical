import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateFireworksConnectionSchema,
  FireworksConnectionSchema,
  ValidateFireworksConnectionCredentialsSchema
} from "./fireworks-connection-schemas";

export type TFireworksConnection = z.infer<typeof FireworksConnectionSchema>;

export type TFireworksConnectionInput = z.infer<typeof CreateFireworksConnectionSchema> & {
  app: AppConnection.Fireworks;
};

export type TValidateFireworksConnectionCredentialsSchema = typeof ValidateFireworksConnectionCredentialsSchema;

export type TFireworksConnectionConfig = DiscriminativePick<
  TFireworksConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
