import { render } from "@react-email/components";
import { createTransport } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import React from "react";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import {
  AccessApprovalRequestTemplate,
  AccessApprovalRequestUpdatedTemplate,
  AccountDeletionConfirmationTemplate,
  EmailMfaTemplate,
  EmailVerificationTemplate,
  ExternalImportFailedTemplate,
  ExternalImportStartedTemplate,
  ExternalImportSucceededTemplate,
  HealthAlertTemplate,
  IntegrationSyncFailedTemplate,
  NewDeviceLoginTemplate,
  OAuthPasswordResetTemplate,
  OrgAdminBreakglassAccessTemplate,
  OrgAdminProjectGrantAccessTemplate,
  OrganizationAssignmentTemplate,
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
  SecretScanningScanFailedTemplate,
  SecretScanningSecretsDetectedTemplate,
  SecretSyncFailedTemplate,
  ServiceTokenExpiryNoticeTemplate,
  SignupEmailVerificationTemplate,
  SubOrganizationInvitationTemplate,
  UnlockAccountTemplate
} from "./emails";
import DynamicSecretLeaseRevocationFailedTemplate from "./emails/DynamicSecretLeaseRevocationFailedTemplate";

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
  AccessApprovalRequestUpdated = "accessApprovalRequestUpdated",
  AccessSecretRequestBypassed = "accessSecretRequestBypassed",
  SecretApprovalRequestNeedsReview = "secretApprovalRequestNeedsReview",
  // HistoricalSecretList = "historicalSecretLeakIncident", not used anymore?
  NewDeviceJoin = "newDevice",
  OrgInvite = "organizationInvitation",
  SubOrgInvite = "subOrganizationInvitation",
  OrgAssignment = "organizationAssignment",
  OAuthPasswordReset = "oAuthPasswordReset",
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
  ServiceTokenExpired = "serviceTokenExpired",
  SecretScanningV2ScanFailed = "secretScanningV2ScanFailed",
  SecretScanningV2SecretsDetected = "secretScanningV2SecretsDetected",
  AccountDeletionConfirmation = "accountDeletionConfirmation",
  HealthAlert = "healthAlert",
  DynamicSecretLeaseRevocationFailed = "dynamicSecretLeaseRevocationFailed"
}

export enum SmtpHost {
  Sendgrid = "smtp.sendgrid.net",
  Mailgun = "smtp.mailgun.org",
  SocketLabs = "smtp.socketlabs.com",
  Zohomail = "smtp.zoho.com",
  Gmail = "smtp.gmail.com",
  Office365 = "smtp.office365.com"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EmailTemplateMap: Record<SmtpTemplates, React.FC<any>> = {
  [SmtpTemplates.OrgInvite]: OrganizationInvitationTemplate,
  [SmtpTemplates.SubOrgInvite]: SubOrganizationInvitationTemplate,
  [SmtpTemplates.OrgAssignment]: OrganizationAssignmentTemplate,
  [SmtpTemplates.NewDeviceJoin]: NewDeviceLoginTemplate,
  [SmtpTemplates.SignupEmailVerification]: SignupEmailVerificationTemplate,
  [SmtpTemplates.EmailMfa]: EmailMfaTemplate,
  [SmtpTemplates.AccessApprovalRequest]: AccessApprovalRequestTemplate,
  [SmtpTemplates.AccessApprovalRequestUpdated]: AccessApprovalRequestUpdatedTemplate,
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
  [SmtpTemplates.OAuthPasswordReset]: OAuthPasswordResetTemplate,
  [SmtpTemplates.ResetPassword]: PasswordResetTemplate,
  [SmtpTemplates.SetupPassword]: PasswordSetupTemplate,
  [SmtpTemplates.PkiExpirationAlert]: PkiExpirationAlertTemplate,
  [SmtpTemplates.SecretScanningV2ScanFailed]: SecretScanningScanFailedTemplate,
  [SmtpTemplates.SecretScanningV2SecretsDetected]: SecretScanningSecretsDetectedTemplate,
  [SmtpTemplates.AccountDeletionConfirmation]: AccountDeletionConfirmationTemplate,
  [SmtpTemplates.HealthAlert]: HealthAlertTemplate,
  [SmtpTemplates.DynamicSecretLeaseRevocationFailed]: DynamicSecretLeaseRevocationFailedTemplate
};

export const smtpServiceFactory = (cfg: TSmtpConfig) => {
  const smtp = createTransport(cfg);
  const isSmtpOn = Boolean(cfg.host);

  const sendMail = async ({ substitutions, recipients, template, subjectLine }: TSmtpSendMail) => {
    const appCfg = getConfig();

    const EmailTemplate = EmailTemplateMap[template];

    if (!EmailTemplate) {
      throw new Error(`Email template ${template} not found`);
    }

    const htmlToSend = await render(
      React.createElement(EmailTemplate, {
        ...substitutions,
        isCloud: appCfg.isCloud,
        siteUrl: appCfg.SITE_URL
      })
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
