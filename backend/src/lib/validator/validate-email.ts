import fs from "fs/promises";
import path from "path";

import { BadRequestError } from "../errors";
import { CharacterType, characterValidator } from "./validate-string";

export const isDisposableEmail = async (emails: string | string[]) => {
  const disposableEmails = await fs.readFile(path.join(__dirname, "disposable_emails.txt"), "utf8");
  if (Array.isArray(emails)) {
    return emails.some((email) => {
      const emailDomain = email.split("@")[1];
      return disposableEmails.split("\n").includes(emailDomain);
    });
  }

  const emailDomain = emails.split("@")[1];
  if (disposableEmails.split("\n").includes(emailDomain)) return true;
  return false;
};

const domainLabelValidator = characterValidator([CharacterType.AlphaNumeric, CharacterType.Hyphen]);
const tldValidator = characterValidator([CharacterType.AlphaNumeric]);

export const isValidEmailDomain = (domain: string): boolean => {
  const parts = domain.split(".");
  if (parts.length < 2) return false;

  for (const label of parts) {
    if (label.length === 0 || label.length > 63) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
    if (!domainLabelValidator(label)) return false;
  }

  // TLD must be at least 2 chars and alphabetic only
  const tld = parts[parts.length - 1];
  if (tld.length < 2 || !tldValidator(tld)) return false;

  return true;
};

export const sanitizeEmail = (email: string) => {
  return email.toLowerCase().trim();
};

export const validateEmail = (email: string) => {
  const userIdentifier = email.slice(0, email.indexOf("@"));
  const domain = email.slice(email.indexOf("@") + 1);

  if (!domain) throw new BadRequestError({ message: "Missing email domain" });
  if (!isValidEmailDomain(domain)) throw new BadRequestError({ message: "Invalid email domain" });

  if (!userIdentifier) throw new BadRequestError({ message: "Missing user identifier in email" });

  if (email.toLowerCase().trim() !== email)
    throw new BadRequestError({ message: "Email contains uppercase characters or leading/trailing whitespace" });
};

const DOTLESS_LOCAL_PART_DOMAINS = new Map([
  ["gmail.com", "gmail.com"],
  ["googlemail.com", "gmail.com"]
]);

export const normalizeEmail = (email: string) => {
  const sanitized = sanitizeEmail(email);

  // Domains never contain "@", so the last one is the separator even for a quoted local part.
  const separatorIdx = sanitized.lastIndexOf("@");
  if (separatorIdx <= 0 || separatorIdx === sanitized.length - 1) return sanitized;

  let localPart = sanitized.slice(0, separatorIdx);
  const domain = sanitized.slice(separatorIdx + 1);

  const plusIdx = localPart.indexOf("+");
  if (plusIdx !== -1) localPart = localPart.slice(0, plusIdx);

  const canonicalDomain = DOTLESS_LOCAL_PART_DOMAINS.get(domain);
  if (canonicalDomain) localPart = localPart.replaceAll(".", "");

  // A local part made only of separators would normalize to nothing and collapse every such address
  // onto a single bucket, throttling unrelated senders together. Fall back to the sanitized form.
  if (!localPart) return sanitized;

  return `${localPart}@${canonicalDomain ?? domain}`;
};

export const isAliasedEmail = (email: string) => normalizeEmail(email) !== sanitizeEmail(email);
