import fs from "fs/promises";
import path from "path";

export const isDisposableEmail = async (email: string | string[]) => {
  const disposableEmails = await fs.readFile(path.join(__dirname, "disposable_emails.txt"), "utf8");
  if (Array.isArray(email)) {
    return email.some((el) => {
      const emailDomain = el.split("@")[1];
      return disposableEmails.split("\n").includes(emailDomain);
    });
  }

  const emailDomain = email.split("@")[1];
  if (disposableEmails.split("\n").includes(emailDomain)) return true;
  return false;
};
