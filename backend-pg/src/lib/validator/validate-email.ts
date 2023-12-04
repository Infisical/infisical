import fs from "fs/promises";
import path from "path";

export const isDisposableEmail = async (email: string) => {
  const emailDomain = email.split("@")[1];
  const disposableEmails = await fs.readFile(path.join(__dirname, "disposable_emails.txt"), "utf8");

  if (disposableEmails.split("\n").includes(emailDomain)) return true;
  return false;
};
