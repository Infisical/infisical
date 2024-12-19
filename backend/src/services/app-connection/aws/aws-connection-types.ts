import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import {
  AwsConnectionSchema,
  CreateAwsConnectionSchema,
  ValidateAwsConnectionCredentialsSchema
} from "./aws-connection-schemas";

export type TAwsConnection = z.infer<typeof AwsConnectionSchema>;

export type TAwsConnectionInput = z.infer<typeof CreateAwsConnectionSchema> & {
  app: AppConnection.AWS;
};

export type TValidateAwsConnectionCredentials = typeof ValidateAwsConnectionCredentialsSchema;

export type TAwsConnectionConfig = DiscriminativePick<TAwsConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
