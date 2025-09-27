import { z } from "zod";

export const BaseSqlAccountSchema = z.object({
  username: z.string().trim().min(1, "Username required"),
  password: z.string().trim().min(1, "Password required")
});
