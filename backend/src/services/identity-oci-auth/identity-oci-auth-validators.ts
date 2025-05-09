import { z } from "zod";

const usernameSchema = z
  .string()
  .min(1, "Username cannot be empty")
  .regex(/^[a-zA-Z0-9._@-]+$/, "Invalid OCI username format");

export const validateUsernames = z
  .string()
  .trim()
  .transform((val) =>
    val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  )
  .refine((arr) => arr.every((name) => usernameSchema.safeParse(name).success), {
    message: "One or more usernames are invalid"
  })
  .transform((arr) => arr.join(", "));
