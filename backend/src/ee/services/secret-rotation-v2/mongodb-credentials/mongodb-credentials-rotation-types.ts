import { z } from "zod";

import { TMongoDBConnection } from "@app/services/app-connection/mongodb";

import {
  CreateMongoDBCredentialsRotationSchema,
  MongoDBCredentialsRotationGeneratedCredentialsSchema,
  MongoDBCredentialsRotationListItemSchema,
  MongoDBCredentialsRotationSchema
} from "./mongodb-credentials-rotation-schemas";

export type TMongoDBCredentialsRotation = z.infer<typeof MongoDBCredentialsRotationSchema>;

export type TMongoDBCredentialsRotationInput = z.infer<typeof CreateMongoDBCredentialsRotationSchema>;

export type TMongoDBCredentialsRotationListItem = z.infer<typeof MongoDBCredentialsRotationListItemSchema>;

export type TMongoDBCredentialsRotationWithConnection = TMongoDBCredentialsRotation & {
  connection: TMongoDBConnection;
};

export type TMongoDBCredentialsRotationGeneratedCredentials = z.infer<
  typeof MongoDBCredentialsRotationGeneratedCredentialsSchema
>;
