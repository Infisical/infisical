import RE2 from "re2";
import { z } from "zod";

const usernameSchema = z
  .string()
  .min(1, "Username cannot be empty")
  .refine((val) => new RE2("^[a-zA-Z0-9._@-]+$").test(val), "Invalid OCI username format");
export const validateUsernames = z
  .string()
  .trim()
  .max(500, "Input exceeds the maximum limit of 500 characters")
  .nullish()
  .transform((val) => {
    if (!val) return [];
    return val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  })
  .refine((arr) => arr.every((name) => usernameSchema.safeParse(name).success), {
    message: "One or more usernames are invalid"
  })
  .transform((arr) => (arr.length > 0 ? arr.join(", ") : null));

export const validateTenancy = z
  .string()
  .trim()
  .min(1, "Tenancy OCID cannot be empty.")
  .refine(
    (val) => new RE2("^ocid1\\.tenancy\\.oc1\\..+$").test(val),
    "Invalid Tenancy OCID format. Must start with ocid1.tenancy.oc1."
  );
