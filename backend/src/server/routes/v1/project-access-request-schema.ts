import { z } from "zod";

export const ProjectAccessRequestCommentSchema = z
  .string()
  .trim()
  .max(2500)
  .refine((value) => !value.includes("\0"), { message: "Comment cannot contain null characters" })
  .optional();
