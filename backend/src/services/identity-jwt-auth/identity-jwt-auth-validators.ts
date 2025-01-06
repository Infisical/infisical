import { z } from "zod";

export const validateJwtAuthAudiencesField = z
  .string()
  .trim()
  .default("")
  .transform((data) => {
    if (data === "") return "";
    return data
      .split(",")
      .map((id) => id.trim())
      .join(", ");
  });

export const validateJwtBoundClaimsField = z.record(z.string()).transform((data) => {
  const formattedClaims: Record<string, string> = {};
  Object.keys(data).forEach((key) => {
    formattedClaims[key] = data[key]
      .split(",")
      .map((id) => id.trim())
      .join(", ");
  });

  return formattedClaims;
});
