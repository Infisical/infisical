import { z } from "zod";

export enum SecretActionType {
  Created = "created",
  Modified = "modified",
  Deleted = "deleted"
}

export const formSchema = z.object({
  key: z.string(),
  value: z.string(),
  idOverride: z.string().optional(),
  valueOverride: z.string().optional(),
  overrideAction: z.string().optional(),
  comment: z.string().trim().optional(),
  skipMultilineEncoding: z.boolean().optional(),
  tags: z
    .object({
      _id: z.string(),
      name: z.string(),
      slug: z.string(),
      tagColor: z.string().optional()
    })
    .array()
    .default([])
});

export type TFormSchema = z.infer<typeof formSchema>;
