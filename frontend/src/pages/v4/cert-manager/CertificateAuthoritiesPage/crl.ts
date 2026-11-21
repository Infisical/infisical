import { z } from "zod";

import {
  MAX_CRL_VALIDITY_DAYS,
  MAX_DISTRIBUTION_POINT_URL_LENGTH,
  MIN_CRL_VALIDITY_DAYS
} from "@app/hooks/api/ca/types";

export type FieldErrors = Partial<Record<string, string>>;

export const firstIssue = (schema: z.ZodTypeAny, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
};

export const hasErrors = (errors: FieldErrors) => Object.values(errors).some(Boolean);

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, "").toLowerCase();

export const crlUrlIssue = (value: string, others: string[]) => {
  const trimmed = value.trim();
  if (!trimmed) return "Enter a URL";
  if (trimmed.length > MAX_DISTRIBUTION_POINT_URL_LENGTH) return "URL is too long";
  if (firstIssue(z.string().url(), trimmed)) return "Must be a valid URL";
  if (!/^https?:\/\//i.test(trimmed)) return "URL must use http:// or https://";
  if (others.some((other) => normalizeUrl(other) === normalizeUrl(trimmed))) return "Duplicate URL";
  return undefined;
};

export const crlValidityIssue = (value: string) => {
  const days = Number(value);
  if (!value.trim() || !Number.isInteger(days)) return "Must be a whole number of days";
  if (days < MIN_CRL_VALIDITY_DAYS) return `Must be at least ${MIN_CRL_VALIDITY_DAYS} day`;
  if (days > MAX_CRL_VALIDITY_DAYS) return `Must be ${MAX_CRL_VALIDITY_DAYS} days or less`;
  return undefined;
};

export type CrlUrl = { id: string; value: string };

export const crlUrlErrors = (urls: CrlUrl[]) =>
  Object.fromEntries(
    urls.map((url, index) => [
      url.id,
      crlUrlIssue(
        url.value,
        urls.slice(0, index).map((entry) => entry.value)
      )
    ])
  );

export const toCrlUrls = (values: string[] = []) =>
  values.map((value) => ({ id: crypto.randomUUID(), value }));
