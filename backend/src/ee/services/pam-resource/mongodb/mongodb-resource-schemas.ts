import ConnectionString from "mongodb-connection-string-url";
import { z } from "zod";

import { PamResource } from "../pam-resource-enums";
import {
  BaseCreateGatewayPamResourceSchema,
  BaseCreatePamAccountSchema,
  BasePamAccountSchema,
  BasePamAccountSchemaWithResource,
  BasePamResourceSchema,
  BaseUpdateGatewayPamResourceSchema,
  BaseUpdatePamAccountSchema
} from "../pam-resource-schemas";

// Resources
// MongoDB uses a connection string (mongodb:// or mongodb+srv:// URI) instead of
// separate host + port fields. The URI is validated and sanitized on input.
export const MongoDBResourceConnectionDetailsSchema = z.object({
  connectionString: z
    .string()
    .trim()
    .min(1)
    .max(1024)
    .transform((val, ctx) => {
      let cs: ConnectionString;
      try {
        cs = new ConnectionString(val);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid MongoDB connection string. Must start with mongodb:// or mongodb+srv://"
        });
        return z.NEVER;
      }

      if (cs.username || cs.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Credentials should not be included in the connection string — they are managed separately per account"
        });
        return z.NEVER;
      }

      if (cs.pathname && cs.pathname !== "/") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Database should not be included in the connection string — use the Database field instead"
        });
        return z.NEVER;
      }

      return cs.toString();
    }),
  database: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "Database name can only contain letters, numbers, underscores, and hyphens"),
  sslEnabled: z.boolean(),
  sslRejectUnauthorized: z.boolean(),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});

export const MongoDBAccountCredentialsSchema = z.object({
  username: z.string().trim().min(1).max(256, "Username must be 256 characters or less"),
  password: z.string().max(256, "Password must be 256 characters or less")
});

const BaseMongoDBResourceSchema = BasePamResourceSchema.extend({ resourceType: z.literal(PamResource.MongoDB) });

export const MongoDBResourceSchema = BaseMongoDBResourceSchema.extend({
  connectionDetails: MongoDBResourceConnectionDetailsSchema,
  rotationAccountCredentials: MongoDBAccountCredentialsSchema.nullable().optional()
});

export const SanitizedMongoDBResourceSchema = BaseMongoDBResourceSchema.extend({
  connectionDetails: MongoDBResourceConnectionDetailsSchema,
  rotationAccountCredentials: MongoDBAccountCredentialsSchema.pick({
    username: true
  })
    .nullable()
    .optional()
});

export const MongoDBResourceListItemSchema = z.object({
  name: z.literal("MongoDB"),
  resource: z.literal(PamResource.MongoDB)
});

export const CreateMongoDBResourceSchema = BaseCreateGatewayPamResourceSchema.extend({
  connectionDetails: MongoDBResourceConnectionDetailsSchema,
  rotationAccountCredentials: MongoDBAccountCredentialsSchema.nullable().optional()
});

export const UpdateMongoDBResourceSchema = BaseUpdateGatewayPamResourceSchema.extend({
  connectionDetails: MongoDBResourceConnectionDetailsSchema.optional(),
  rotationAccountCredentials: MongoDBAccountCredentialsSchema.nullable().optional()
});

// Accounts
export const MongoDBAccountSchema = BasePamAccountSchema.extend({
  credentials: MongoDBAccountCredentialsSchema
});

export const CreateMongoDBAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: MongoDBAccountCredentialsSchema
});

export const UpdateMongoDBAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: MongoDBAccountCredentialsSchema.optional()
});

export const SanitizedMongoDBAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  resourceType: z.literal(PamResource.MongoDB),
  credentials: MongoDBAccountCredentialsSchema.pick({
    username: true
  })
});

// Sessions
export const MongoDBSessionCredentialsSchema = MongoDBResourceConnectionDetailsSchema.and(
  MongoDBAccountCredentialsSchema
);
