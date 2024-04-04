import fs from "node:fs/promises";
import path from "node:path";

import handlebars from "handlebars";
import { createTransport } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";

import { logger } from "@app/lib/logger";

export type TSmtpConfig = SMTPTransport.Options;
export type TSmtpSendMail = {
  template: SmtpTemplates;
  subjectLine: string;
  recipients: string[];
  substitutions: unknown;
};
export type TSmtpService = ReturnType<typeof smtpServiceFactory>;

export enum SmtpTemplates {
  EmailVerification = "emailVerification.handlebars",
  SecretReminder = "secretReminder.handlebars",
  EmailMfa = "emailMfa.handlebars",
  AccessApprovalRequest = "accessApprovalRequest.handlebars",
  HistoricalSecretList = "historicalSecretLeakIncident.handlebars",
  NewDeviceJoin = "newDevice.handlebars",
  OrgInvite = "organizationInvitation.handlebars",
  ResetPassword = "passwordReset.handlebars",
  SecretLeakIncident = "secretLeakIncident.handlebars",
  WorkspaceInvite = "workspaceInvitation.handlebars",
  ScimUserProvisioned = "scimUserProvisioned.handlebars"
}

export enum SmtpHost {
  Sendgrid = "smtp.sendgrid.net",
  Mailgun = "smtp.mailgun.org",
  SocketLabs = "smtp.sockerlabs.com",
  Zohomail = "smtp.zoho.com",
  Gmail = "smtp.gmail.com",
  Office365 = "smtp.office365.com"
}

export const getTlsOption = (host?: SmtpHost | string, secure?: boolean) => {
  if (!secure) return { secure: false };
  if (!host) return { secure: true };

  if ((host as SmtpHost) === SmtpHost.Sendgrid) {
    return { secure: true, port: 465 }; // more details here https://nodemailer.com/smtp/
  }
  if (host.includes("amazonaws.com")) {
    return { tls: { ciphers: "TLSv1.2" } };
  }
  return { requireTLS: true, tls: { ciphers: "TLSv1.2" } };
};

export const smtpServiceFactory = (cfg: TSmtpConfig) => {
  const smtp = createTransport({ ...cfg, ...getTlsOption(cfg.host, cfg.secure) });
  const isSmtpOn = Boolean(cfg.host);

  const sendMail = async ({ substitutions, recipients, template, subjectLine }: TSmtpSendMail) => {
    const html = await fs.readFile(path.resolve(__dirname, "./templates/", template), "utf8");
    const temp = handlebars.compile(html);
    const htmlToSend = temp(substitutions);
    if (isSmtpOn) {
      await smtp.sendMail({
        from: cfg.from,
        to: recipients.join(", "),
        subject: subjectLine,
        html: htmlToSend
      });
    } else {
      logger.info("SMTP is not configured. Outputting it in terminal");
      logger.info({
        from: cfg.from,
        to: recipients.join(", "),
        subject: subjectLine,
        html: htmlToSend
      });
    }
  };

  return { sendMail };
};
