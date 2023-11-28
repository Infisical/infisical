/* eslint-disable no-nested-ternary */
import { z } from "zod";

export enum SecretActionType {
  Created = "created",
  Modified = "modified",
  Deleted = "deleted"
}

export const formSchema = z.object({
  key: z.string().trim(),
  value: z.string().transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim())),
  idOverride: z.string().trim().optional(),
  valueOverride: z
    .string()
    .optional()
    .transform((val) =>
      typeof val === "string" ? (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()) : val
    ),
  overrideAction: z.string().trim().optional(),
  comment: z.string().trim().optional(),
  skipMultilineEncoding: z.boolean().optional(),

  reminderRepeatDays: z
    .number()
    .min(1, { message: "Days must be between 1 and 365" })
    .max(365, { message: "Days must be between 1 and 365" })
    .nullable()
    .optional(),
  reminderNote: z.string().trim().nullable().optional(),

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
