import RE2 from "re2";
import { z } from "zod";

const arnSchema = z
  .string()
  .refine(
    (val) => new RE2("^acs:ram::[0-9]{16}:(user|role|assumed-role)/.*$").test(val),
    "Invalid ARN format. Expected format: acs:ram::[0-9]{16}:(user|role|assumed-role)/*"
  );
export const validateArns = z
  .string()
  .trim()
  .min(1, "Allowed ARNs required")
  .max(500, "Input exceeds the maximum limit of 500 characters")
  .transform((val) => {
    if (!val) return [];
    return val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  })
  .refine((arr) => arr.every((name) => arnSchema.safeParse(name).success), {
    message: "One or more ARNs are invalid"
  })
  .transform((arr) => arr.join(", "));
