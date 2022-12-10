import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import nodemailer from 'nodemailer';
import {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_NAME,
  SMTP_USERNAME,
  SMTP_PASSWORD
} from '../config';
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
// create nodemailer transporter
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

/**
 * @param {Object} obj
 * @param {String} obj.template - email template to use from /templates folder (e.g. testEmail.handlebars)
 * @param {String[]} obj.subjectLine - email subject line
 * @param {String[]} obj.recipients - email addresses of people to send email to
 * @param {Object} obj.substitutions - object containing template substitutions
 */
const sendMail = async ({
  template,
  subjectLine,
  recipients,
  substitutions
}: {
  template: string;
  subjectLine: string;
  recipients: string[];
  substitutions: any;
}) => {
  try {
    const html = fs.readFileSync(
      path.resolve(__dirname, '../templates/' + template),
      'utf8'
    );
    const temp = handlebars.compile(html);
    const htmlToSend = temp(substitutions);

    await transporter.sendMail({
      from: `"${SMTP_NAME}" <${SMTP_USERNAME}>`,
      to: recipients.join(', '),
      subject: subjectLine,
      html: htmlToSend
    });
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
  }
};

export { sendMail };
