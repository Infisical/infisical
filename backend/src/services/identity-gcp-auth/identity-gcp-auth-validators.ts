import { z } from "zod";

import { IdentityGcpAuthsSchema } from "@app/db/schemas";

export const ModifiedIdentityGcpAuthsSchema = IdentityGcpAuthsSchema.omit({
  encryptedCredentials: true,
  credentialsIV: true,
  credentialsTag: true
}).extend({
  credentials: z.string()
});

export const validateGcpAuthField = z
  .string()
  .trim()
  .default("")
  .transform((data) => {
    if (data === "") return "";
    // Trim each ID and join with ', ' to ensure formatting
    return data
      .split(",")
      .map((id) => id.trim())
      .join(", ");
  });
