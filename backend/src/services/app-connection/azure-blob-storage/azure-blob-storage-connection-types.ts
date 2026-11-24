import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  AzureBlobStorageConnectionSchema,
  CreateAzureBlobStorageConnectionSchema,
  ValidateAzureBlobStorageConnectionCredentialsSchema
} from "./azure-blob-storage-connection-schemas";

export type TAzureBlobStorageConnection = z.infer<typeof AzureBlobStorageConnectionSchema>;

export type TAzureBlobStorageConnectionInput = z.infer<typeof CreateAzureBlobStorageConnectionSchema> & {
  app: AppConnection.AzureBlobStorage;
};

export type TValidateAzureBlobStorageConnectionCredentialsSchema =
  typeof ValidateAzureBlobStorageConnectionCredentialsSchema;

export type TAzureBlobStorageConnectionConfig = DiscriminativePick<
  TAzureBlobStorageConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
