import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateWindmillConnectionSchema,
  ValidateWindmillConnectionCredentialsSchema,
  WindmillConnectionSchema
} from "./windmill-connection-schemas";

export type TWindmillConnection = z.infer<typeof WindmillConnectionSchema>;

export type TWindmillConnectionInput = z.infer<typeof CreateWindmillConnectionSchema> & {
  app: AppConnection.Windmill;
};

export type TValidateWindmillConnectionCredentialsSchema = typeof ValidateWindmillConnectionCredentialsSchema;

export type TWindmillConnectionConfig = DiscriminativePick<
  TWindmillConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TWindmillWorkspace = { id: string; name: string; deleted: boolean };
