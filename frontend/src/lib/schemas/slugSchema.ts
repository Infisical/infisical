import slugify from "@sindresorhus/slugify";
import { z } from "zod";

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .refine((val) => val.toLowerCase() === val, "Must be lowercase")
  .refine((v) => slugify(v) === v, {
    message: "Invalid slug format"
  });
