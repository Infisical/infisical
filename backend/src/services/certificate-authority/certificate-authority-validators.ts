import { z } from "zod";

import { isValidIp } from "@app/lib/ip";
import { isFQDN } from "@app/lib/validator/validate-url";

const isValidDate = (dateString: string) => {
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
};

export const validateCaDateField = z.string().trim().refine(isValidDate, { message: "Invalid date format" });

export const validateAltNameField = z
  .string()
  .trim()
  .refine(
    (name) => {
      return isFQDN(name) || z.string().email().safeParse(name).success || isValidIp(name);
    },
    {
      message: "SAN must be a valid hostname, email address, or IP address"
    }
  );

export const validateAltNamesField = z
  .string()
  .trim()
  .default("")
  .transform((data) => {
    if (data === "") return "";
    // Trim each alt name and join with ', ' to ensure formatting
    return data
      .split(",")
      .map((id) => id.trim())
      .join(", ");
  })
  .refine(
    (data) => {
      if (data === "") return true;
      // Split and validate each alt name
      return data.split(", ").every((name) => {
        return isFQDN(name, { allow_wildcard: true }) || z.string().email().safeParse(name).success || isValidIp(name);
      });
    },
    {
      message: "Each alt name must be a valid hostname or email address"
    }
  );
