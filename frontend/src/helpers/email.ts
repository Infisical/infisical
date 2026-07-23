import { z } from "zod";

const EmailSchema = z.string().email().min(1).trim().toLowerCase();

// Zod's .email() accepts addresses the backend/DB reject: domain labels over 63 chars
// (backend/src/lib/validator/validate-email.ts) and emails longer than the users table's
// varchar(255) email/username columns. Mirror both here so oversized/malformed addresses are
// caught inline instead of failing with a 400 (bad domain) or 500 (too long) from the API.
const MAX_EMAIL_LENGTH = 255;
const MAX_DOMAIN_LABEL_LENGTH = 63;
const DOMAIN_LABEL_REGEX = /^[a-zA-Z0-9-]+$/;
const TLD_REGEX = /^[a-zA-Z0-9]+$/;

const isValidEmailDomain = (domain: string) => {
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

export const isValidEmail = (email: string) =>
  email.length <= MAX_EMAIL_LENGTH &&
  EmailSchema.safeParse(email).success &&
  isValidEmailDomain(email.slice(email.indexOf("@") + 1));

// Mirror the backend cap (inviteeEmails.array().max(100)) so oversized invites are rejected inline
// before hitting the API.
export const MAX_INVITE_EMAILS = 100;

export const parseEmailList = (value: string) =>
  value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

// Shared validation for a comma-separated email list entered in a textarea. Embed it directly as an
// object field in a react-hook-form schema: z.object({ emails: emailListSchema, ... }).
export const emailListSchema = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((value, ctx) => {
    const emails = parseEmailList(value);

    if (!emails.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter at least one email address."
      });
      return;
    }

    if (emails.length > MAX_INVITE_EMAILS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `You can invite up to ${MAX_INVITE_EMAILS} users at a time.`
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
