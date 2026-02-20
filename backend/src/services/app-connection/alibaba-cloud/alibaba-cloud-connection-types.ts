import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  AlibabaCloudConnectionListItemSchema,
  AlibabaCloudConnectionSchema,
  CreateAlibabaCloudConnectionSchema,
  ValidateAlibabaCloudConnectionCredentialsSchema
} from "./alibaba-cloud-connection-schemas";

export type TAlibabaCloudConnection = z.infer<typeof AlibabaCloudConnectionSchema>;

export type TAlibabaCloudConnectionInput = z.infer<typeof CreateAlibabaCloudConnectionSchema> & {
  app: AppConnection.AlibabaCloud;
};

export type TValidateAlibabaCloudConnectionCredentialsSchema =
  typeof ValidateAlibabaCloudConnectionCredentialsSchema;

export type TAlibabaCloudConnectionConfig = DiscriminativePick<
  TAlibabaCloudConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TAlibabaCloudConnectionListItem = z.infer<typeof AlibabaCloudConnectionListItemSchema>;
