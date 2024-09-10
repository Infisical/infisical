import { z } from "zod";

const isValidDate = (dateString: string) => {
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
};

export const validateCaDateField = z.string().trim().refine(isValidDate, { message: "Invalid date format" });

export const hostnameRegex = /^(?!:\/\/)(\*\.)?([a-zA-Z0-9-_]{1,63}\.?)+(?!:\/\/)([a-zA-Z]{2,63})$/;
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
        return hostnameRegex.test(name) || z.string().email().safeParse(name).success;
      });
    },
    {
      message: "Each alt name must be a valid hostname or email address"
    }
  );
