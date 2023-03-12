import nodemailer from 'nodemailer';
import { 
  SMTP_HOST, 
  SMTP_PORT, 
  SMTP_USERNAME, 
  SMTP_PASSWORD, 
  SMTP_SECURE 
} from '../config';
import {
  SMTP_HOST_SENDGRID, 
  SMTP_HOST_MAILGUN,
  SMTP_HOST_SOCKETLABS,
  SMTP_HOST_ZOHOMAIL
} from '../variables';
import SMTPConnection from 'nodemailer/lib/smtp-connection';
import * as Sentry from '@sentry/node';

const mailOpts: SMTPConnection.Options = {
  host: SMTP_HOST,
  port: SMTP_PORT as number
};

if (SMTP_USERNAME && SMTP_PASSWORD) {
  mailOpts.auth = {
    user: SMTP_USERNAME,
    pass: SMTP_PASSWORD
  };
}

if (SMTP_SECURE) {
  switch (SMTP_HOST) {
    case SMTP_HOST_SENDGRID:
      mailOpts.requireTLS = true;
      break;
    case SMTP_HOST_MAILGUN:
      mailOpts.requireTLS = true; 
      mailOpts.tls = {
        ciphers: 'TLSv1.2'
      }
      break;
    case SMTP_HOST_SOCKETLABS:
      mailOpts.requireTLS = true; 
      mailOpts.tls = {
        ciphers: 'TLSv1.2'
      }
      break;
    case SMTP_HOST_ZOHOMAIL:
      mailOpts.requireTLS = true; 
      mailOpts.tls = {
        ciphers: 'TLSv1.2'
      }
      break; 
    default:
      if (SMTP_HOST.includes('amazonaws.com')) {
        mailOpts.tls = {
          ciphers: 'TLSv1.2'
        }
      } else {
        mailOpts.secure = true;
      }
      break;
  }
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
