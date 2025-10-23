import safe from "safe-regex";
import z from "zod";

import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";

export const createTemplateFieldValidator = (options?: {
  minLength?: number;
  maxLength?: number;
  allowedCharacters?: CharacterType[];
  customMessage?: string;
}) => {
  const {
    minLength = 1,
    maxLength = 100,
    allowedCharacters = [
      CharacterType.AlphaNumeric,
      CharacterType.Spaces, // (space)
      CharacterType.Asterisk, // *
      CharacterType.At, // @
      CharacterType.Hyphen, // -
      CharacterType.Period, // .
      CharacterType.Backslash // \
    ],
    customMessage = "Invalid pattern: only alphanumeric characters, spaces, *, ., @, -, and \\ are allowed."
  } = options || {};

  return (
    z
      .string()
      .min(minLength)
      .max(maxLength)
      .refine((val) => characterValidator(allowedCharacters)(val), {
        message: customMessage
      })
      // we ensure that the inputted pattern is computationally safe by limiting star height to 1
      .refine((v) => safe(v), {
        message: "Unsafe REGEX pattern"
      })
  );
};

export const validateTemplateRegexField = createTemplateFieldValidator();
