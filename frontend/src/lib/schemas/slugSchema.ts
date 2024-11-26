import slugify from "@sindresorhus/slugify";
import { z } from "zod";

interface SlugSchemaInputs {
  min?: number;
  max?: number;
  field?: string;
}

export const slugSchema = ({ min = 1, max = 32, field = "Slug" }: SlugSchemaInputs = {}) => {
  return z
    .string()
    .trim()
    .toLowerCase()
    .min(min, {
      message: `${field} field must be at least ${min} character${min === 1 ? "" : "s"}`
    })
    .max(max, {
      message: `${field} field must be at most ${max} character${max === 1 ? "" : "s"}`
    })
    .refine((v) => slugify(v, { lowercase: true, separator: "-" }) === v, {
      message: `${field} field can only contain letters, numbers, and hyphens`
    });
};
