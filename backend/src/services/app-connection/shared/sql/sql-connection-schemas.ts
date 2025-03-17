import { z } from "zod";

export const BaseSqlUsernameAndPasswordConnectionSchema = z.object({
  host: z.string().trim().min(1, "Host required"),
  port: z.coerce.number(),
  database: z.string().trim().min(1, "Database required"),
  username: z.string().trim().min(1, "Username required"),
  password: z.string().trim().min(1, "Password required"),
  ca: z.string().trim().optional()
});
