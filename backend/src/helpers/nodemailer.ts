import * as Sentry from '@sentry/node';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import nodemailer from 'nodemailer';
import { getSmtpFromName, getSmtpFromAddress, getSmtpConfigured } from '../config';
import { htmlToText } from 'html-to-text';

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
  if (getSmtpConfigured()) {
    try {
      const html = fs.readFileSync(
        path.resolve(__dirname, '../templates/' + template),
        'utf8'
      );
      const temp = handlebars.compile(html);
      const textOptions = {
        wordwrap: 130,
        selectors: [
          {
            selector: "table",
            format: "dataTable"
          }, {
            selector: "a.social-link",
            format: "unorderedList"
          }

        ]
      }
      const htmlToSend = temp(substitutions);
      const textToSend = htmlToText(htmlToSend, textOptions);

      await smtpTransporter.sendMail({
        from: `"${getSmtpFromName()}" <${getSmtpFromAddress()}>`,
        to: recipients.join(', '),
        subject: subjectLine,
        html: htmlToSend,
        text: textToSend
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
