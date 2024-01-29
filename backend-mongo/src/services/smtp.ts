import nodemailer from "nodemailer";
import {
  SMTP_HOST_GMAIL,
  SMTP_HOST_MAILGUN,
  SMTP_HOST_OFFICE365,
  SMTP_HOST_SENDGRID,
  SMTP_HOST_SOCKETLABS,
  SMTP_HOST_ZOHOMAIL
} from "../variables";
import SMTPConnection from "nodemailer/lib/smtp-connection";
import {
  getSmtpHost,
  getSmtpPassword,
  getSmtpPort,
  getSmtpSecure,
  getSmtpUsername
} from "../config";

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

  if ((await getSmtpSecure()) ? await getSmtpSecure() : false) {
    switch (await getSmtpHost()) {
      case SMTP_HOST_SENDGRID:
        mailOpts.requireTLS = true;
        break;
      case SMTP_HOST_MAILGUN:
        mailOpts.requireTLS = true;
        mailOpts.tls = {
          ciphers: "TLSv1.2"
        };
        break;
      case SMTP_HOST_SOCKETLABS:
        mailOpts.requireTLS = true;
        mailOpts.tls = {
          ciphers: "TLSv1.2"
        };
        break;
      case SMTP_HOST_ZOHOMAIL:
        mailOpts.requireTLS = true;
        mailOpts.tls = {
          ciphers: "TLSv1.2"
        };
        break;
      case SMTP_HOST_GMAIL:
        mailOpts.requireTLS = true;
        mailOpts.tls = {
          ciphers: "TLSv1.2"
        };
        break;
      case SMTP_HOST_OFFICE365:
        mailOpts.requireTLS = true;
        mailOpts.tls = {
          ciphers: "TLSv1.2"
        };
        break;
      default:
        if ((await getSmtpHost()).includes("amazonaws.com")) {
          mailOpts.tls = {
            ciphers: "TLSv1.2"
          };
        } else {
          mailOpts.secure = true;
        }
        break;
    }
  }

  const transporter = nodemailer.createTransport(mailOpts);

  return transporter;
};
