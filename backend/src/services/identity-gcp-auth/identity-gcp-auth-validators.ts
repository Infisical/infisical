import { z } from "zod";

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
