import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateGiteaConnectionSchema,
  GiteaConnectionSchema,
  ValidateGiteaConnectionCredentialsSchema
} from "./gitea-connection-schemas";

export type TGiteaConnection = z.infer<typeof GiteaConnectionSchema>;

export type TGiteaConnectionInput = z.infer<typeof CreateGiteaConnectionSchema> & {
  app: AppConnection.Gitea;
};

export type TValidateGiteaConnectionCredentialsSchema = typeof ValidateGiteaConnectionCredentialsSchema;

export type TGiteaConnectionConfig = DiscriminativePick<TGiteaConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
