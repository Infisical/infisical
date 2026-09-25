import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { TemporaryPermissionMode } from "@app/db/schemas";
import { ms } from "@app/lib/ms";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { re2Validator } from "@app/lib/zod";

interface SlugSchemaInputs {
  min?: number;
  max?: number;
  field?: string;
  trim?: boolean;
}

export const slugSchema = ({ min = 1, max = 64, field = "Slug", trim = true }: SlugSchemaInputs = {}) => {
  const base = trim ? z.string().trim() : z.string();
  return base
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

// Project slugs allow underscores as word separators in addition to hyphens, so they cannot reuse
// `slugSchema`: that validator normalizes with slugify, which rewrites `_` to `-` and therefore
// rejects slugs the project write paths accept.
export const projectSlugSchema = z
  .string()
  .trim()
  .max(64, { message: "Slug must be 64 characters or fewer" })
  .refine(re2Validator(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/), {
    message:
      "Project slug can only contain lowercase letters and numbers, with optional single hyphens (-) or underscores (_) between words. Cannot start or end with a hyphen or underscore."
  });

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

/**
 * Helper to hide a field from OpenAPI documentation while still accepting it in the API.
 * Usage: z.string().describe(openApiHidden())
 */
export const openApiHidden = () => JSON.stringify({ "x-hidden": true });

// The shared `type` body field for temporary vs permanent access grants (additional privileges,
// folder access). Parameterized by the endpoint's api-docs strings so every route documents its
// own vocabulary while accepting the exact same shape.
export const temporaryPermissionTypeSchema = (docs: {
  isTemporary: string;
  temporaryMode: string;
  temporaryRange: string;
  temporaryAccessStartTime: string;
}) =>
  z.discriminatedUnion("isTemporary", [
    z.object({
      isTemporary: z.literal(false).describe(docs.isTemporary)
    }),
    z.object({
      isTemporary: z.literal(true).describe(docs.isTemporary),
      temporaryMode: z.nativeEnum(TemporaryPermissionMode).describe(docs.temporaryMode),
      temporaryRange: z
        .string()
        .trim()
        .max(32)
        .refine((val) => ms(val) > 0, "Temporary range must be a positive duration such as 30m, 4h or 1d")
        .describe(docs.temporaryRange),
      temporaryAccessStartTime: z.string().datetime().describe(docs.temporaryAccessStartTime)
    })
  ]);
