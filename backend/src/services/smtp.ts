import nodemailer from 'nodemailer';
import {
  SMTP_HOST_SENDGRID, 
  SMTP_HOST_MAILGUN,
  SMTP_HOST_SOCKETLABS,
  SMTP_HOST_ZOHOMAIL,
  SMTP_HOST_GMAIL
} from '../variables';
import SMTPConnection from 'nodemailer/lib/smtp-connection';
import * as Sentry from '@sentry/node';
import {
  getSmtpHost,
  getSmtpUsername,
  getSmtpPassword,
  getSmtpSecure,
  getSmtpPort
} from '../config';

export const initSmtp = async () => {
  const mailOpts: SMTPConnection.Options = {
    host: await getSmtpHost(),
    port: await getSmtpPort()
  };

  if ((await getSmtpUsername()) && (await getSmtpPassword())) {
    mailOpts.auth = {
      user: await getSmtpUsername(),
      pass: await getSmtpPassword()
    };
  }

  if ((await getSmtpSecure()) ? (await getSmtpSecure()) : false) {
    switch (await getSmtpHost()) {
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
      case SMTP_HOST_GMAIL:
        mailOpts.requireTLS = true; 
        mailOpts.tls = {
          ciphers: 'TLSv1.2'
        }
        break; 
      default:
        if ((await getSmtpHost()).includes('amazonaws.com')) {
          mailOpts.tls = {
            ciphers: 'TLSv1.2'
          }
        } else {
          mailOpts.secure = true;
        }
        break;
    }
  }

  const transporter = nodemailer.createTransport(mailOpts);
  transporter
    .verify()
    .then((err) => {
      Sentry.setUser(null);
      Sentry.captureMessage('SMTP - Successfully connected');
    })
    .catch(async (err) => {
      Sentry.setUser(null);
      Sentry.captureException(
        `SMTP - Failed to connect to ${await getSmtpHost()}:${await getSmtpPort()} \n\t${err}`
      );
    });

  return transporter;
};
