import safe from "safe-regex";
import z from "zod";

import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";

export const validateTemplateRegexField = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (val) =>
      characterValidator([
        CharacterType.AlphaNumeric,
        CharacterType.Spaces, // (space)
        CharacterType.Asterisk, // *
        CharacterType.At, // @
        CharacterType.Hyphen, // -
        CharacterType.Period, // .
        CharacterType.Backslash // \
      ])(val),
    {
      message: "Invalid pattern: only alphanumeric characters, spaces, *, ., @, -, and \\ are allowed."
    }
  )
  // we ensure that the inputted pattern is computationally safe by limiting star height to 1
  .refine((v) => safe(v), {
    message: "Unsafe REGEX pattern"
  });
