import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateHasuraCloudConnectionSchema,
  HasuraCloudConnectionSchema,
  ValidateHasuraCloudConnectionCredentialsSchema
} from "./hasura-cloud-connection-schemas";

export type THasuraCloudConnection = z.infer<typeof HasuraCloudConnectionSchema>;

export type THasuraCloudConnectionInput = z.infer<typeof CreateHasuraCloudConnectionSchema> & {
  app: AppConnection.HasuraCloud;
};

export type TValidateHasuraCloudConnectionCredentialsSchema = typeof ValidateHasuraCloudConnectionCredentialsSchema;

export type THasuraCloudConnectionConfig = DiscriminativePick<
  THasuraCloudConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
