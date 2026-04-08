import { z } from "zod";

import {
  MongoDBAccountCredentialsSchema,
  MongoDBAccountSchema,
  MongoDBResourceConnectionDetailsSchema,
  MongoDBResourceSchema
} from "./mongodb-resource-schemas";

// Resources
export type TMongoDBResource = z.infer<typeof MongoDBResourceSchema>;
export type TMongoDBResourceConnectionDetails = z.infer<typeof MongoDBResourceConnectionDetailsSchema>;

// Accounts
export type TMongoDBAccount = z.infer<typeof MongoDBAccountSchema>;
export type TMongoDBAccountCredentials = z.infer<typeof MongoDBAccountCredentialsSchema>;
