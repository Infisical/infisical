import slugify from "@sindresorhus/slugify";
import { z } from "zod";

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
