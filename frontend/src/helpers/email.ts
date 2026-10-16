import { z } from "zod";

const EmailSchema = z.string().email().min(1).trim().toLowerCase();

// Zod's .email() accepts addresses the backend/DB reject: domain labels over 63 chars
// (backend/src/lib/validator/validate-email.ts) and emails longer than the users table's
// varchar(255) email/username columns. Mirror both here so oversized/malformed addresses are
// caught inline instead of failing with a 400 (bad domain) or 500 (too long) from the API.
const MAX_EMAIL_LENGTH = 255;
const MAX_DOMAIN_LABEL_LENGTH = 63;
const MAX_ALLOWED_EMAIL_DOMAINS_LENGTH = 255;
const DOMAIN_LABEL_REGEX = /^[a-zA-Z0-9-]+$/;
const TLD_REGEX = /^[a-zA-Z0-9]+$/;

export const isValidEmailDomain = (domain: string) => {
  const labels = domain.split(".");
  if (labels.length < 2) return false;

  const tld = labels[labels.length - 1];
  if (tld.length < 2 || !TLD_REGEX.test(tld)) return false;

  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= MAX_DOMAIN_LABEL_LENGTH &&
      !label.startsWith("-") &&
      !label.endsWith("-") &&
      DOMAIN_LABEL_REGEX.test(label)
  );
};

const getDomainEntries = (value: string) =>
  value
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);

const normalizeDomain = (domain: string) => domain.replace(/^@/, "").trim().toLowerCase();

export const normalizeAllowedEmailDomains = (value: string) =>
  Array.from(new Set(getDomainEntries(value).map(normalizeDomain))).join(", ");

export const allowedEmailDomainsSchema = z
  .string()
  .superRefine((value, context) => {
    const domainEntries = getDomainEntries(value);
    const invalidDomains = domainEntries.filter(
      (domain) => !isValidEmailDomain(normalizeDomain(domain))
    );

    if (value.trim() && !domainEntries.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter at least one valid email domain"
      });
    }

    if (invalidDomains.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid email domain${invalidDomains.length > 1 ? "s" : ""}: ${invalidDomains.join(", ")}`
      });
    }

    if (normalizeAllowedEmailDomains(value).length > MAX_ALLOWED_EMAIL_DOMAINS_LENGTH) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: MAX_ALLOWED_EMAIL_DOMAINS_LENGTH,
        inclusive: true,
        type: "string",
        message: `Email domains must be ${MAX_ALLOWED_EMAIL_DOMAINS_LENGTH} characters or fewer`
      });
    }
  })
  .transform(normalizeAllowedEmailDomains);

// The authoritative frontend email-shape check. It answers whether an address is well formed and
// fits what the backend stores; it never claims the mailbox or domain exists.
export const isValidEmail = (email: string) =>
  email.length <= MAX_EMAIL_LENGTH &&
  EmailSchema.safeParse(email).success &&
  isValidEmailDomain(email.slice(email.indexOf("@") + 1));

// Mirror the backend cap (inviteeEmails.array().max(100)) so oversized invites are rejected inline
// before hitting the API.
export const MAX_INVITE_EMAILS = 100;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Splits pasted or typed text on commas, semicolons and whitespace, normalizes each address, and
// drops duplicates while keeping the first occurrence's order. EmailInput runs every change through
// this, so a value held by a form is always a clean, deduplicated list.
export const EMAIL_LIST_DELIMITER = /[\s,;]+/;

export const parseEmailList = (values: string[]) =>
  Array.from(
    new Set(
      values
        .flatMap((value) => value.split(EMAIL_LIST_DELIMITER))
        .map(normalizeEmail)
        .filter(Boolean)
    )
  );

// Shared validation for an EmailInput value. Embed it directly as an object field in a
// react-hook-form schema: z.object({ emails: emailListSchema({ max: MAX_INVITE_EMAILS }) }).
// Shape validation only: an address that passes is well formed, not known to exist.
export const emailListSchema = ({
  max,
  isRequired = false
}: {
  max?: number;
  isRequired?: boolean;
} = {}) =>
  z.array(z.string()).superRefine((emails, ctx) => {
    if (isRequired && !emails.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter at least one email address."
      });
      return;
    }

    if (max !== undefined && emails.length > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Enter up to ${max} email address${max === 1 ? "" : "es"}.`
      });
    }

    const invalidEmails = emails.filter((email) => !isValidEmail(email));

    if (invalidEmails.length) {
      const preview = invalidEmails
        .slice(0, 3)
        .map((email) => (email.length > 40 ? `${email.slice(0, 40)}...` : email))
        .join(", ");
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          invalidEmails.length > 3
            ? `${invalidEmails.length} invalid email addresses (e.g. ${preview}).`
            : `Invalid email address${invalidEmails.length > 1 ? "es" : ""}: ${preview}.`
      });
    }
  });
