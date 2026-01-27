import { z } from "zod";

export * from "./slugSchema";

export const GenericResourceNameSchema = z
  .string()
  .trim()
  .min(1, { message: "Name must be at least 1 character" })
  .max(64, { message: "Name must be 64 or fewer characters" })
  .regex(
    /^[a-zA-Z0-9\-_\s]+$/,
    "Name can only contain alphanumeric characters, dashes, underscores, and spaces"
  );

export const BaseSecretNameSchema = z.string().trim().min(1);

export const SecretNameSchema = BaseSecretNameSchema.refine(
  (el) => !el.includes(" "),
  "Secret name cannot contain spaces."
).refine((el) => !el.includes(":"), "Secret name cannot contain colon.");

export const safeJWTSchema = z
  .string()
  .trim()
  .min(1, { message: "Token is required" })
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Token contains invalid characters. Only letters, numbers, dots, hyphens, and underscores are allowed."
  );
