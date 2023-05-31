import * as Sentry from '@sentry/node';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import nodemailer from 'nodemailer';
import { getSmtpFromName, getSmtpFromAddress, getSmtpConfigured } from '../config';

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
  if (await getSmtpConfigured()) {
    try {
      const html = fs.readFileSync(
        path.resolve(__dirname, '../templates/' + template),
        'utf8'
      );
      const temp = handlebars.compile(html);
      const htmlToSend = temp(substitutions);

      await smtpTransporter.sendMail({
        from: `"${await getSmtpFromName()}" <${await getSmtpFromAddress()}>`,
        to: recipients.join(', '),
        subject: subjectLine,
        html: htmlToSend
      });
    } catch (err) {
      Sentry.setUser(null);
      Sentry.captureException(err);
    }
  }
};

const setTransporter = (transporter: nodemailer.Transporter) => {
  smtpTransporter = transporter;
};

export { sendMail, setTransporter };
