import { z } from "zod";

export const BaseSqlAccountSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(255, "Username must be 255 characters or less"),
  password: z.string().trim().min(1, "Password required")
});
