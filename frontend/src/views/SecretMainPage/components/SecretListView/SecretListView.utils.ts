/* eslint-disable no-nested-ternary */
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faCheck,
  faClock,
  faClone,
  faClose,
  faCodeBranch,
  faComment,
  faCopy,
  faEllipsis,
  faKey,
  faShare,
  faTags
} from "@fortawesome/free-solid-svg-icons";
import { z } from "zod";

export enum SecretActionType {
  Created = "created",
  Modified = "modified",
  Deleted = "deleted"
}

export const formSchema = z.object({
  key: z.string().trim().min(1, { message: "Secret key is required" }),
  value: z
    .string()
    .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()))
    .optional(),
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
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      tagColor: z.string().optional()
    })
    .array()
    .default([])
    .optional()
});

export type TFormSchema = z.infer<typeof formSchema>;

export enum FontAwesomeSpriteName {
  SecretKey = "secret-key",
  Check = "check",
  ClipboardCopy = "clipboard-copy",
  Tags = "secret-tags",
  Clock = "reminder-clock",
  Comment = "comment",
  More = "more",
  Override = "secret-override",
  Close = "close",
  CheckedCircle = "check-circle",
  ReplicatedSecretKey = "secret-replicated",
  ShareSecret = "share-secret"
}

// this is an optimization technique
// https://docs.fontawesome.com/web/add-icons/svg-symbols
export const FontAwesomeSpriteSymbols = [
  { icon: faKey, symbol: FontAwesomeSpriteName.SecretKey },
  { icon: faCheck, symbol: FontAwesomeSpriteName.Check },
  { icon: faCopy, symbol: FontAwesomeSpriteName.ClipboardCopy },
  { icon: faTags, symbol: FontAwesomeSpriteName.Tags },
  { icon: faClock, symbol: FontAwesomeSpriteName.Clock },
  { icon: faComment, symbol: FontAwesomeSpriteName.Comment },
  { icon: faEllipsis, symbol: FontAwesomeSpriteName.More },
  { icon: faCodeBranch, symbol: FontAwesomeSpriteName.Override },
  { icon: faClose, symbol: FontAwesomeSpriteName.Close },
  { icon: faCheckCircle, symbol: FontAwesomeSpriteName.CheckedCircle },
  { icon: faClone, symbol: FontAwesomeSpriteName.ReplicatedSecretKey },
  { icon: faShare, symbol: FontAwesomeSpriteName.ShareSecret }
];
