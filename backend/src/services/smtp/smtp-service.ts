import fs from "node:fs/promises";
import path from "node:path";

import handlebars from "handlebars";
import { createTransport } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

export type TSmtpConfig = SMTPTransport.Options;
export type TSmtpSendMail = {
  template: SmtpTemplates;
  subjectLine: string;
  recipients: string[];
  substitutions: object;
};
export type TSmtpService = ReturnType<typeof smtpServiceFactory>;

export enum SmtpTemplates {
  SignupEmailVerification = "signupEmailVerification.handlebars",
  EmailVerification = "emailVerification.handlebars",
  SecretReminder = "secretReminder.handlebars",
  EmailMfa = "emailMfa.handlebars",
  UnlockAccount = "unlockAccount.handlebars",
  AccessApprovalRequest = "accessApprovalRequest.handlebars",
  AccessSecretRequestBypassed = "accessSecretRequestBypassed.handlebars",
  SecretApprovalRequestNeedsReview = "secretApprovalRequestNeedsReview.handlebars",
  HistoricalSecretList = "historicalSecretLeakIncident.handlebars",
  NewDeviceJoin = "newDevice.handlebars",
  OrgInvite = "organizationInvitation.handlebars",
  ResetPassword = "passwordReset.handlebars",
  SecretLeakIncident = "secretLeakIncident.handlebars",
  WorkspaceInvite = "workspaceInvitation.handlebars",
  ScimUserProvisioned = "scimUserProvisioned.handlebars",
  PkiExpirationAlert = "pkiExpirationAlert.handlebars",
  IntegrationSyncFailed = "integrationSyncFailed.handlebars",
  SecretSyncFailed = "secretSyncFailed.handlebars",
  ExternalImportSuccessful = "externalImportSuccessful.handlebars",
  ExternalImportFailed = "externalImportFailed.handlebars",
  ExternalImportStarted = "externalImportStarted.handlebars"
}

export enum SmtpHost {
  Sendgrid = "smtp.sendgrid.net",
  Mailgun = "smtp.mailgun.org",
  SocketLabs = "smtp.sockerlabs.com",
  Zohomail = "smtp.zoho.com",
  Gmail = "smtp.gmail.com",
  Office365 = "smtp.office365.com"
}

export const smtpServiceFactory = (cfg: TSmtpConfig) => {
  const smtp = createTransport(cfg);
  const isSmtpOn = Boolean(cfg.host);

  handlebars.registerHelper("emailFooter", () => {
    const { SITE_URL } = getConfig();
    return new handlebars.SafeString(
      `<p style="font-size: 12px;">Email sent via Infisical at <a href="${SITE_URL}">${SITE_URL}</a></p>`
    );
  });

  const sendMail = async ({ substitutions, recipients, template, subjectLine }: TSmtpSendMail) => {
    const appCfg = getConfig();
    const html = await fs.readFile(path.resolve(__dirname, "./templates/", template), "utf8");
    const temp = handlebars.compile(html);
    const htmlToSend = temp({ isCloud: appCfg.isCloud, siteUrl: appCfg.SITE_URL, ...substitutions });

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

  const verify = async () => {
    const isConnected = smtp
      .verify()
      .then(async () => {
        logger.info("SMTP connected");
        return true;
      })
      .catch((err: Error) => {
        logger.error("SMTP error");
        logger.error(err);
        return false;
      });

    return isConnected;
  };

  return { sendMail, verify };
};
