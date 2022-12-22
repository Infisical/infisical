import nodemailer from 'nodemailer';
import { SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_SECURE } from '../config';
import SMTPConnection from 'nodemailer/lib/smtp-connection';
import * as Sentry from '@sentry/node';

const mailOpts: SMTPConnection.Options = {
  host: SMTP_HOST,
  secure: SMTP_SECURE as boolean,
  port: SMTP_PORT as number
};
if (SMTP_USERNAME && SMTP_PASSWORD) {
  mailOpts.auth = {
    user: SMTP_USERNAME,
    pass: SMTP_PASSWORD
  };
}

export const initSmtp = () => {
  const transporter = nodemailer.createTransport(mailOpts);
  transporter
    .verify()
    .then(() => {
      Sentry.setUser(null);
      Sentry.captureMessage('SMTP - Successfully connected');
    })
    .catch((err) => {
      Sentry.setUser(null);
      Sentry.captureException(
        `SMTP - Failed to connect to ${SMTP_HOST}:${SMTP_PORT} \n\t${err}`
      );
    });

  return transporter;
};
