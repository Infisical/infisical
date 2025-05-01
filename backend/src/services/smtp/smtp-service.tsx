import { render } from "@react-email/components";
import handlebars from "handlebars";
import { createTransport } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import React from "react";
import {
  AccessApprovalRequestTemplate,
  EmailMfaTemplate,
  EmailVerificationTemplate,
  ExternalImportFailedTemplate,
  ExternalImportStartedTemplate,
  ExternalImportSucceededTemplate,
  IntegrationSyncFailedTemplate,
  NewDeviceLoginTemplate,
  OrgAdminBreakglassAccessTemplate,
  OrganizationInvitationTemplate,
  PasswordResetTemplate,
  PasswordSetupTemplate,
  PkiExpirationAlertTemplate,
  ProjectAccessRequestTemplate,
  ProjectInvitationTemplate,
  ScimUserProvisionedTemplate,
  SecretApprovalRequestBypassedTemplate,
  SecretApprovalRequestNeedsReviewTemplate,
  SecretLeakIncidentTemplate,
  SecretReminderTemplate,
  SecretRequestCompletedTemplate,
  SecretRotationFailedTemplate,
  SecretSyncFailedTemplate,
  ServiceTokenExpiryNoticeTemplate,
  SignupEmailVerificationTemplate,
  UnlockAccountTemplate
} from "src/services/smtp/emails";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import OrgAdminProjectGrantAccessTemplate from "./emails/OrgAdminProjectGrantAccessTemplate";

export type TSmtpConfig = SMTPTransport.Options;
export type TSmtpSendMail = {
  template: SmtpTemplates;
  subjectLine: string;
  recipients: string[];
  substitutions: object;
};
export type TSmtpService = ReturnType<typeof smtpServiceFactory>;

export enum SmtpTemplates {
  SignupEmailVerification = "signupEmailVerification",
  EmailVerification = "emailVerification",
  SecretReminder = "secretReminder",
  EmailMfa = "emailMfa",
  UnlockAccount = "unlockAccount",
  AccessApprovalRequest = "accessApprovalRequest",
  AccessSecretRequestBypassed = "accessSecretRequestBypassed",
  SecretApprovalRequestNeedsReview = "secretApprovalRequestNeedsReview",
  // HistoricalSecretList = "historicalSecretLeakIncident", not used anymore?
  NewDeviceJoin = "newDevice",
  OrgInvite = "organizationInvitation",
  ResetPassword = "passwordReset",
  SetupPassword = "passwordSetup",
  SecretLeakIncident = "secretLeakIncident",
  WorkspaceInvite = "workspaceInvitation",
  ScimUserProvisioned = "scimUserProvisioned",
  PkiExpirationAlert = "pkiExpirationAlert",
  IntegrationSyncFailed = "integrationSyncFailed",
  SecretSyncFailed = "secretSyncFailed",
  ExternalImportSuccessful = "externalImportSuccessful",
  ExternalImportFailed = "externalImportFailed",
  ExternalImportStarted = "externalImportStarted",
  SecretRequestCompleted = "secretRequestCompleted",
  SecretRotationFailed = "secretRotationFailed",
  ProjectAccessRequest = "projectAccess",
  OrgAdminProjectDirectAccess = "orgAdminProjectGrantAccess",
  OrgAdminBreakglassAccess = "orgAdminBreakglassAccess",
  ServiceTokenExpired = "serviceTokenExpired"
}

export enum SmtpHost {
  Sendgrid = "smtp.sendgrid.net",
  Mailgun = "smtp.mailgun.org",
  SocketLabs = "smtp.sockerlabs.com",
  Zohomail = "smtp.zoho.com",
  Gmail = "smtp.gmail.com",
  Office365 = "smtp.office365.com"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EmailTemplateMap: Record<SmtpTemplates, React.FC<any>> = {
  [SmtpTemplates.OrgInvite]: OrganizationInvitationTemplate,
  [SmtpTemplates.NewDeviceJoin]: NewDeviceLoginTemplate,
  [SmtpTemplates.SignupEmailVerification]: SignupEmailVerificationTemplate,
  [SmtpTemplates.EmailMfa]: EmailMfaTemplate,
  [SmtpTemplates.AccessApprovalRequest]: AccessApprovalRequestTemplate,
  [SmtpTemplates.EmailVerification]: EmailVerificationTemplate,
  [SmtpTemplates.ExternalImportFailed]: ExternalImportFailedTemplate,
  [SmtpTemplates.ExternalImportStarted]: ExternalImportStartedTemplate,
  [SmtpTemplates.ExternalImportSuccessful]: ExternalImportSucceededTemplate,
  [SmtpTemplates.AccessSecretRequestBypassed]: SecretApprovalRequestBypassedTemplate,
  [SmtpTemplates.IntegrationSyncFailed]: IntegrationSyncFailedTemplate,
  [SmtpTemplates.OrgAdminBreakglassAccess]: OrgAdminBreakglassAccessTemplate,
  [SmtpTemplates.SecretLeakIncident]: SecretLeakIncidentTemplate,
  [SmtpTemplates.WorkspaceInvite]: ProjectInvitationTemplate,
  [SmtpTemplates.ScimUserProvisioned]: ScimUserProvisionedTemplate,
  [SmtpTemplates.SecretRequestCompleted]: SecretRequestCompletedTemplate,
  [SmtpTemplates.UnlockAccount]: UnlockAccountTemplate,
  [SmtpTemplates.ServiceTokenExpired]: ServiceTokenExpiryNoticeTemplate,
  [SmtpTemplates.SecretReminder]: SecretReminderTemplate,
  [SmtpTemplates.SecretRotationFailed]: SecretRotationFailedTemplate,
  [SmtpTemplates.SecretSyncFailed]: SecretSyncFailedTemplate,
  [SmtpTemplates.OrgAdminProjectDirectAccess]: OrgAdminProjectGrantAccessTemplate,
  [SmtpTemplates.ProjectAccessRequest]: ProjectAccessRequestTemplate,
  [SmtpTemplates.SecretApprovalRequestNeedsReview]: SecretApprovalRequestNeedsReviewTemplate,
  [SmtpTemplates.ResetPassword]: PasswordResetTemplate,
  [SmtpTemplates.SetupPassword]: PasswordSetupTemplate,
  [SmtpTemplates.PkiExpirationAlert]: PkiExpirationAlertTemplate
};

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

    const EmailTemplate = EmailTemplateMap[template];

    if (!EmailTemplate) {
      throw new Error(`Email template ${template} not found`);
    }

    const htmlToSend = await render(
      <EmailTemplate {...substitutions} isCloud={appCfg.isCloud} siteUrl={appCfg.SITE_URL} />
    );

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
