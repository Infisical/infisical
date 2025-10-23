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

export const BaseSqlRotationAccountSchema = z
  .object({
    username: z.string().trim().max(63, "Username must be 63 characters or less"),
    password: z.string().trim().max(256, "Password must be 256 characters or less")
  })
  .superRefine((data, ctx) => {
    if (data.username && !data.password) {
      ctx.addIssue({
        path: ["password"],
        message: "Password is required",
        code: z.ZodIssueCode.custom
      });
    }
    if (data.password && !data.username) {
      ctx.addIssue({
        path: ["username"],
        message: "Username is required",
        code: z.ZodIssueCode.custom
      });
    }
  })
  .transform((val) => {
    if (!val.username && !val.password) {
      return null;
    }
    return val;
  });
