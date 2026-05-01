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
