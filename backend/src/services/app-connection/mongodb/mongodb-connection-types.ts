import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateMongoDBConnectionSchema,
  MongoDBConnectionSchema,
  ValidateMongoDBConnectionCredentialsSchema
} from "./mongodb-connection-schemas";

export type TMongoDBConnection = z.infer<typeof MongoDBConnectionSchema>;

export type TMongoDBConnectionInput = z.infer<typeof CreateMongoDBConnectionSchema> & {
  app: AppConnection.MongoDB;
};

export type TValidateMongoDBConnectionCredentialsSchema = typeof ValidateMongoDBConnectionCredentialsSchema;

export type TMongoDBConnectionConfig = DiscriminativePick<TMongoDBConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
