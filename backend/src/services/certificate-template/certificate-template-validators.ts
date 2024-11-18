import safe from "safe-regex";
import z from "zod";

export const validateTemplateRegexField = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9 *@\-\\.\\]+$/, {
    message: "Invalid pattern: only alphanumeric characters, spaces, *, ., @, -, and \\ are allowed."
  })
  // we ensure that the inputted pattern is computationally safe by limiting star height to 1
  .refine((v) => safe(v), {
    message: "Unsafe REGEX pattern"
  });
