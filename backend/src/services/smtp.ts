import infisical from 'infisical-node';
import nodemailer from 'nodemailer';
import {
  SMTP_HOST_SENDGRID, 
  SMTP_HOST_MAILGUN,
  SMTP_HOST_SOCKETLABS,
  SMTP_HOST_ZOHOMAIL
} from '../variables';
import SMTPConnection from 'nodemailer/lib/smtp-connection';
import * as Sentry from '@sentry/node';

export const initSmtp = () => {
  const mailOpts: SMTPConnection.Options = {
    host: infisical.get('SMTP_HOST')!,
    port: parseInt(infisical.get('SMTP_PORT')!)
  };

  if (infisical.get('SMTP_USERNAME')! && infisical.get('SMTP_PASSWORD')!) {
    mailOpts.auth = {
      user: infisical.get('SMTP_USERNAME')!,
      pass: infisical.get('SMTP_PASSWORD')!
    };
  }

  if (infisical.get('SMTP_SECURE')! ? infisical.get('SMTP_SECURE')! === 'true' : false) {
    switch (infisical.get('SMTP_HOST')!) {
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
        if (infisical.get('SMTP_HOST')!.includes('amazonaws.com')) {
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
    .then(() => {
      Sentry.setUser(null);
      Sentry.captureMessage('SMTP - Successfully connected');
    })
    .catch((err) => {
      Sentry.setUser(null);
      Sentry.captureException(
        `SMTP - Failed to connect to ${infisical.get('SMTP_HOST')!}:${infisical.get('SMTP_PORT')!} \n\t${err}`
      );
    });

  return transporter;
};
