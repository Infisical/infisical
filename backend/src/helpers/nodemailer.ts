import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import nodemailer from 'nodemailer';
import { SMTP_FROM_NAME, SMTP_FROM_ADDRESS } from '../config';
import * as Sentry from '@sentry/node';

let smtpTransporter: nodemailer.Transporter;

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

    await smtpTransporter.sendMail({
      from: `"${SMTP_FROM_NAME}" <${SMTP_FROM_ADDRESS}>`,
      to: recipients.join(', '),
      subject: subjectLine,
      html: htmlToSend
    });
  } catch (err) {
    Sentry.setUser(null);
    Sentry.captureException(err);
  }
};

const setTransporter = (transporter: nodemailer.Transporter) => {
  smtpTransporter = transporter;
};

export { sendMail, setTransporter };
