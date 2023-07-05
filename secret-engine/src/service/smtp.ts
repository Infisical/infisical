import nodemailer from "nodemailer";
import SMTPConnection from "nodemailer/lib/smtp-connection";

export const SMTP_HOST_SENDGRID = "smtp.sendgrid.net";
export const SMTP_HOST_MAILGUN = "smtp.mailgun.org";
export const SMTP_HOST_SOCKETLABS = "smtp.socketlabs.com";
export const SMTP_HOST_ZOHOMAIL = "smtp.zoho.com";
export const SMTP_HOST_GMAIL = "smtp.gmail.com";

export const initSmtp = async () => {
  const mailOpts: SMTPConnection.Options = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
  };

  if ((process.env.SMTP_USERNAME) && (process.env.SMTP_PASSWORD)) {
    mailOpts.auth = {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD,
    };
  }

  if ((process.env.SMTP_SECURE) ? (process.env.SMTP_SECURE) : false) {
    switch (process.env.SMTP_HOST) {
      case SMTP_HOST_SENDGRID:
        mailOpts.requireTLS = true;
        break;
      case SMTP_HOST_MAILGUN:
        mailOpts.requireTLS = true;
        mailOpts.tls = {
          ciphers: "TLSv1.2",
        }
        break;
      case SMTP_HOST_SOCKETLABS:
        mailOpts.requireTLS = true;
        mailOpts.tls = {
          ciphers: "TLSv1.2",
        }
        break;
      case SMTP_HOST_ZOHOMAIL:
        mailOpts.requireTLS = true;
        mailOpts.tls = {
          ciphers: "TLSv1.2",
        }
        break;
      case SMTP_HOST_GMAIL:
        mailOpts.requireTLS = true;
        mailOpts.tls = {
          ciphers: "TLSv1.2",
        }
        break;
      default:
        if ((process.env.SMTP_HOST).includes("amazonaws.com")) {
          mailOpts.tls = {
            ciphers: "TLSv1.2",
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
      console.log("SMTP - Successfully connected")
    })
    .catch(async (err) => {
      console.log(
        `SMTP - Failed to connect to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} \n\t${err}`
      );
    });

  return transporter;
};
