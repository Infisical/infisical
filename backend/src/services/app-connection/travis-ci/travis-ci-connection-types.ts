import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateTravisCIConnectionSchema,
  TravisCIConnectionSchema,
  ValidateTravisCIConnectionCredentialsSchema
} from "./travis-ci-connection-schemas";

export type TTravisCIConnection = z.infer<typeof TravisCIConnectionSchema>;

export type TTravisCIConnectionInput = z.infer<typeof CreateTravisCIConnectionSchema> & {
  app: AppConnection.TravisCI;
};

export type TValidateTravisCIConnectionCredentialsSchema = typeof ValidateTravisCIConnectionCredentialsSchema;

export type TTravisCIConnectionConfig = DiscriminativePick<
  TTravisCIConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TravisCIRepository = {
  id: string;
  name: string;
  slug: string;
};

export type TravisCIBranch = {
  name: string;
  isDefault: boolean;
};
