import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import nodemailer from 'nodemailer';
import { SMTP_HOST, SMTP_NAME, SMTP_USERNAME, SMTP_PASSWORD } from '../config';

// create nodemailer transporter
const transporter = nodemailer.createTransport({
	host: SMTP_HOST,
	port: 587,
	auth: {
		user: SMTP_USERNAME,
		pass: SMTP_PASSWORD
	}
});
transporter
	.verify()
	.then(() => console.log('SMTP - Successfully connected'))
	.catch((err) => console.log('SMTP - Failed to connect'));

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
		console.error(err);
	}
};

export { sendMail };
