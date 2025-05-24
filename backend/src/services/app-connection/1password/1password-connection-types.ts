import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateOnePassConnectionSchema,
  OnePassConnectionSchema,
  ValidateOnePassConnectionCredentialsSchema
} from "./1password-connection-schemas";

export type TOnePassConnection = z.infer<typeof OnePassConnectionSchema>;

export type TOnePassConnectionInput = z.infer<typeof CreateOnePassConnectionSchema> & {
  app: AppConnection.OnePass;
};

export type TValidateOnePassConnectionCredentialsSchema = typeof ValidateOnePassConnectionCredentialsSchema;

export type TOnePassConnectionConfig = DiscriminativePick<TOnePassConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TOnePassVault = {
  id: string;
  name: string;
  type: string;
  items: number;

  attributeVersion: number;
  contentVersion: number;

  createdAt: string;
  updatedAt: string;
};
