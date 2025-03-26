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
