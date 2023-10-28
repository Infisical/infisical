import Queue, { Job } from "bull";
import { Reminder, Membership } from "../../models";
import { sendMail } from "../../helpers/nodemailer";
import _ from "lodash";


export const reminderEmailTask = new Queue("reminder-email-task", "redis://redis:6379");

reminderEmailTask.process(async (job: Job) => {
  const reminders = await Reminder.find({}).populate("secret");

  for (const reminder of reminders) {
    const currentDate = new Date(Date.now());
    const triggerDate = new Date(reminder.lastEmailSent.getTime());
    triggerDate.setDate(triggerDate.getDate() + reminder.frequency);

    if (currentDate >= triggerDate) {
      const note = reminder.note;
      // @ts-ignore
      const workspace = reminder.secret.workspace.toString();
      const wsMembers = await Membership.find({ workspace }).populate("user");
      const emails = _.map(wsMembers, e => _.get(e, ['user', 'email']));
      // @ts-ignore
      const environment = reminder.secret.environment;
      // TODO - Update the link in the future. Ideally, we should have a secret detail page map via url
      const link = `http://localhost:8080/project/${workspace}/secrets/${environment}`;

      // send email
      await sendMail({
        template: "secretReminder.handlebars",
        subjectLine: "Secret Rotation Reminder",
        recipients: emails,
        substitutions: {
          note,
          link
        }
      });

      reminder.lastEmailSent = currentDate;
      reminder.save();
    }
  }

})

reminderEmailTask.add({}, { repeat: { cron: "0 0 * * *" } });

reminderEmailTask.on("error", (error) => {
  console.error("unable to run reminder-email-task", error)
})