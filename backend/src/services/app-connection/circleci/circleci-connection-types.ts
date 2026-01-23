import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateCircleCIConnectionSchema,
  CircleCIConnectionSchema,
  ValidateCircleCIConnectionCredentialsSchema
} from "./circleci-connection-schemas";

export type TCircleCIConnection = z.infer<typeof CircleCIConnectionSchema>;

export type TCircleCIConnectionInput = z.infer<typeof CreateCircleCIConnectionSchema> & {
  app: AppConnection.CircleCI;
};

export type TValidateCircleCIConnectionCredentialsSchema = typeof ValidateCircleCIConnectionCredentialsSchema;

export type TCircleCIConnectionConfig = DiscriminativePick<
  TCircleCIConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TCircleCIProject = {
  id: string;
  name: string;
  slug: string;
};
