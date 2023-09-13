import { sendMail } from "./nodemailer";

/**
 * Send reminder to the user to download their MFA recovery codes
 * to avoid being locked out of their account (eg. if they lose access to their MFA-configured device)
 * @param {Object} obj
 * @param {String} obj.email - email
 * @returns {Boolean} success - whether or not operation was successful
 */
export const sendEmailDownloadRecoveryCodes = async ({ email }: { email: string }) => {
  // send mail
  await sendMail({
    template: "downloadRecoveryCodes.handlebars",
    subjectLine: "[Infisical] Please download your multi-factor recovery codes",
    recipients: [email],
    substitutions: {},
  });
};