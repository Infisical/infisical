import { z } from "zod";

import { DISALLOWED_LABEL_CHARS_RE } from "./sessionLabelSchema";

export const SESSION_METADATA_MAX_KEYS = 20;
export const SESSION_METADATA_KEY_MAX_LENGTH = 255;
export const SESSION_METADATA_VALUE_MAX_LENGTH = 1020;

export type TSessionMetadataRow = { key: string; value: string };

const isBlankRow = (row: TSessionMetadataRow) => !row.key.trim() && !row.value.trim();

export const sessionMetadataRowsSchema = z
  .object({
    key: z
      .string()
      .trim()
      .max(
        SESSION_METADATA_KEY_MAX_LENGTH,
        `A key can be at most ${SESSION_METADATA_KEY_MAX_LENGTH} characters`
      )
      .refine(
        (key) => !DISALLOWED_LABEL_CHARS_RE.test(key),
        "A key can't contain line breaks, tabs, or invisible characters."
      ),
    value: z
      .string()
      .trim()
      .max(
        SESSION_METADATA_VALUE_MAX_LENGTH,
        `A value can be at most ${SESSION_METADATA_VALUE_MAX_LENGTH} characters`
      )
      .refine(
        (value) => !DISALLOWED_LABEL_CHARS_RE.test(value),
        "A value can't contain line breaks, tabs, or invisible characters."
      )
  })
  .array()
  .superRefine((rows, ctx) => {
    const seenKeys = new Set<string>();
    let filledCount = 0;

    rows.forEach((row, index) => {
      if (isBlankRow(row)) return;
      filledCount += 1;

      if (!row.key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "Enter a key, or remove this row."
        });
        return;
      }

      if (seenKeys.has(row.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: `The metadata key '${row.key}' appears more than once. Each key can be used once per session.`
        });
      }
      seenKeys.add(row.key);
    });

    if (filledCount > SESSION_METADATA_MAX_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A session can have at most ${SESSION_METADATA_MAX_KEYS} metadata keys.`
      });
    }
  });

export const metadataRowsToRecord = (rows: TSessionMetadataRow[]): Record<string, string> =>
  Object.fromEntries(
    rows.filter((row) => !isBlankRow(row)).map((row) => [row.key.trim(), row.value.trim()])
  );

export const metadataRecordToRows = (metadata: Record<string, string>): TSessionMetadataRow[] =>
  Object.entries(metadata).map(([key, value]) => ({ key, value }));

export const isSameSessionMetadata = (a: Record<string, string>, b: Record<string, string>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => b[key] === a[key]);
};
