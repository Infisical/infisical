import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateHerokuConnectionSchema,
  HerokuConnectionSchema,
  ValidateHerokuConnectionCredentialsSchema
} from "./heroku-connection-schemas";

export type THerokuConnection = z.infer<typeof HerokuConnectionSchema>;

export type THerokuConnectionInput = z.infer<typeof CreateHerokuConnectionSchema> & {
  app: AppConnection.Heroku;
};

export type TValidateHerokuConnectionCredentialsSchema = typeof ValidateHerokuConnectionCredentialsSchema;

export type THerokuConnectionConfig = DiscriminativePick<THerokuConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type THerokuApp = {
  name: string;
  id: string;
};
