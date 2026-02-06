import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";

interface SlugSchemaInputs {
  min?: number;
  max?: number;
  field?: string;
}

export const slugSchema = ({ min = 1, max = 64, field = "Slug" }: SlugSchemaInputs = {}) => {
  return z
    .string()
    .trim()
    .min(min, {
      message: `${field} field must be at least ${min} lowercase character${min === 1 ? "" : "s"}`
    })
    .max(max, {
      message: `${field} field must be at most ${max} lowercase character${max === 1 ? "" : "s"}`
    })
    .refine((v) => slugify(v, { lowercase: true }) === v, {
      message: `${field} field can only contain lowercase letters, numbers, and hyphens`
    });
};

export const GenericResourceNameSchema = z
  .string()
  .trim()
  .min(1, { message: "Name must be at least 1 character" })
  .max(64, { message: "Name must be 64 or fewer characters" })
  .refine(
    (val) =>
      characterValidator([
        CharacterType.AlphaNumeric,
        CharacterType.Hyphen,
        CharacterType.Underscore,
        CharacterType.Spaces
      ])(val),
    "Name can only contain alphanumeric characters, dashes, underscores, and spaces"
  );

export const BaseSecretNameSchema = z.string().trim().min(1);

export const SecretNameSchema = BaseSecretNameSchema.refine(
  (el) => !el.includes(":") && !el.includes("/"),
  "Secret name cannot contain colon or forward slash."
);
