import nodemailer from 'nodemailer';
import {
  SMTP_HOST_SENDGRID, 
  SMTP_HOST_MAILGUN,
  SMTP_HOST_SOCKETLABS,
  SMTP_HOST_ZOHOMAIL
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

export const initSmtp = () => {
  const mailOpts: SMTPConnection.Options = {
    host: getSmtpHost(),
    port: getSmtpPort()
  };

  if (getSmtpUsername() && getSmtpPassword()) {
    mailOpts.auth = {
      user: getSmtpUsername(),
      pass: getSmtpPassword()
    };
  }

  if (getSmtpSecure() ? getSmtpSecure() : false) {
    switch (getSmtpHost()) {
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
        if (getSmtpHost().includes('amazonaws.com')) {
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
    .catch((err) => {
      Sentry.setUser(null);
      Sentry.captureException(
        `SMTP - Failed to connect to ${getSmtpHost()}:${getSmtpPort()} \n\t${err}`
      );
    });

  return transporter;
};
