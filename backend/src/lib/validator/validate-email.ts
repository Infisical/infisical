import fs from "fs/promises";
import path from "path";
import { getDomain } from "tldts";
import { BadRequestError } from "../errors";

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

export const validateEmail = (email: string) => {
  const domain = getDomain(email);
  if (!domain) throw new BadRequestError({ message: "Missing email domain" });

  const userIdentifier = email.split("@")[0];
  if (!userIdentifier) throw new BadRequestError({ message: "Missing user identifier in email" });

  if (userIdentifier.includes("+"))
    throw new BadRequestError({ message: "Email user identifier contains a plus sign" });

  if (email.toLowerCase() !== email) throw new BadRequestError({ message: "Email contains uppercase characters" });
};
