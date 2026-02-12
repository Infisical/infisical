import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { PKI_ALERT_RETRY_CONFIG, RETRYABLE_NETWORK_ERRORS } from "./pki-alert-v2-constants";
import { TCertificatePreview, TChannelResult, TEmailChannelConfig } from "./pki-alert-v2-types";

const isEmailErrorRetryable = (err: Error): boolean => {
  const msg = err.message.toLowerCase();
  if (RETRYABLE_NETWORK_ERRORS.some((code) => msg.includes(code.toLowerCase()))) return true;
  if (msg.includes("timeout") || msg.includes("connection")) return true;
  if (["421", "450", "451", "452"].some((code) => msg.includes(code))) return true;
  return false;
};

export const sendEmailNotification = async (
  smtpService: Pick<TSmtpService, "sendMail">,
  config: TEmailChannelConfig,
  alertName: string,
  alertBeforeDays: number,
  projectId: string,
  matchingCertificates: TCertificatePreview[]
): Promise<void> => {
  await smtpService.sendMail({
    recipients: config.recipients,
    subjectLine: `Infisical Certificate Alert - ${alertName}`,
    substitutions: {
      alertName,
      alertBeforeDays,
      projectId,
      items: matchingCertificates.map((cert) => ({
        type: "Certificate",
        friendlyName: cert.commonName,
        serialNumber: cert.serialNumber,
        expiryDate: cert.notAfter.toLocaleDateString()
      }))
    },
    template: SmtpTemplates.PkiExpirationAlert
  });
};

export const sendEmailNotificationWithRetry = async (
  smtpService: Pick<TSmtpService, "sendMail">,
  config: TEmailChannelConfig,
  alertName: string,
  alertBeforeDays: number,
  projectId: string,
  matchingCertificates: TCertificatePreview[],
  alertId: string,
  channelId: string
): Promise<TChannelResult> => {
  const { maxRetries, delayMs } = PKI_ALERT_RETRY_CONFIG;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await sendEmailNotification(smtpService, config, alertName, alertBeforeDays, projectId, matchingCertificates);
      return { success: true };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (!isEmailErrorRetryable(lastError)) {
        logger.info(
          { alertId, channelId, error: lastError.message },
          "PKI email error is not retryable (permanent SMTP error)"
        );
        return { success: false, error: lastError.message };
      }

      logger.info(
        { alertId, channelId, attempt, maxRetries, error: lastError.message },
        `PKI email failed, ${attempt < maxRetries ? `retrying in ${delayMs}ms` : "no more retries"}`
      );

      if (attempt < maxRetries) {
        // eslint-disable-next-line no-await-in-loop
        await delay(delayMs);
      }
    }
  }

  return { success: false, error: lastError?.message };
};
