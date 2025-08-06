import { z } from "zod";

import { isValidIp } from "@app/lib/ip";
import { isFQDN } from "@app/lib/validator/validate-url";
import { TAltNameMapping, TAltNameType } from "@app/services/certificate/certificate-types";

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
      return (
        isFQDN(name, { allow_wildcard: true, require_tld: false }) ||
        z.string().url().safeParse(name).success ||
        z.string().email().safeParse(name).success ||
        isValidIp(name)
      );
    },
    {
      message: "SAN must be a valid hostname, email address, IP address or URL"
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
        return (
          isFQDN(name, { allow_wildcard: true, require_tld: false }) ||
          z.string().url().safeParse(name).success ||
          z.string().email().safeParse(name).success ||
          isValidIp(name)
        );
      });
    },
    {
      message: "Each alt name must be a valid hostname, email address, IP address or URL"
    }
  );

export const validateAndMapAltNameType = (name: string): TAltNameMapping | null => {
  if (isFQDN(name, { allow_wildcard: true, require_tld: false })) {
    return { type: TAltNameType.DNS, value: name };
  }
  if (z.string().url().safeParse(name).success) {
    return { type: TAltNameType.URL, value: name };
  }
  if (z.string().email().safeParse(name).success) {
    return { type: TAltNameType.EMAIL, value: name };
  }
  if (isValidIp(name)) {
    return { type: TAltNameType.IP, value: name };
  }
  return null;
};
