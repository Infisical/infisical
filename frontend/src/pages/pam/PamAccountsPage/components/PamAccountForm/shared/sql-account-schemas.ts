import { z } from "zod";

export const BaseSqlAccountSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(63, "Username must be 63 characters or less"),
  password: z
    .string()
    .trim()
    .min(1, "Password required")
    .max(256, "Password must be 256 characters or less")
});
