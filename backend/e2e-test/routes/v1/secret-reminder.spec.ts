import { OrgMembershipRole, ProjectMembershipRole } from "@app/db/schemas";

import { up as migrateRemindersToAlerts } from "../../../src/db/migrations/20260929130000_migrate-secret-reminders-to-alerts";
import { updateAlert } from "../../testUtils/alerts";
import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { createFolder, deleteFolder } from "../../testUtils/folders";
import {
  deleteSecretReminder,
  getSecretReminder,
  listSecretReminderAlerts,
  reapOrphanedReminderAlerts,
  reminderEmailsFor,
  runDailyReminders,
  setSecretReminder,
  waitForReminderEmails
} from "../../testUtils/reminders";
import { createSecretV2, getSecretByNameV2 } from "../../testUtils/secrets";
import { addUserMembership, createUser, deleteUsers } from "../../testUtils/users";

const ENVIRONMENT = "dev";
const DAY_MS = 24 * 60 * 60 * 1000;
// Above pollUntil's own 20s, so a slow CI runner fails on what it was waiting for, not on vitest's 5s default.
const EMAIL_DELIVERY_TIMEOUT_MS = 30_000;

const startOfUtcDay = (date: Date) => {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  return day;
};

describe("Secret reminders delivered through alerts", () => {
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;
  // A project member other than the caller, so a reminder's recipients are never just whoever set it.
  let member: { userId: string; username: string };
  let createdUserIds: string[] = [];

  const newUser = async (label: string) => {
    const user = await createUser(label);
    createdUserIds.push(user.userId);
    return user;
  };

  beforeEach(async () => {
    let orgId: string;
    ({ orgId, projectId, authToken, cleanup } = await createIsolatedOrgAndProject("reminders"));
    member = await newUser("reminder-recipient");
    await addUserMembership({ userId: member.userId, orgId, role: OrgMembershipRole.Member });
    await addUserMembership({ userId: member.userId, orgId, projectId, role: ProjectMembershipRole.Member });
  });

  afterEach(async () => {
    await cleanup();
    await deleteUsers(createdUserIds);
    createdUserIds = [];
  });

  const createSecret = async (key: string, opts: { secretPath?: string } = {}) => {
    const secret = await createSecretV2({
      workspaceId: projectId,
      environmentSlug: ENVIRONMENT,
      secretPath: opts.secretPath ?? "/",
      key,
      value: "value",
      authToken
    });
    return secret.id;
  };

  const reminderAlerts = (secretId: string) => listSecretReminderAlerts({ projectId, secretId, authToken });

  // The alert API cannot show a reaped alert's channels (every read goes through the alert), so the
  // rows that must go with it are checked directly.
  const expectAlertFullyRemoved = async (alert: { id: string; channels: { id: string }[] }) => {
    const channelIds = alert.channels.map((channel) => channel.id);
    expect(channelIds.length).toBeGreaterThan(0);
    expect(await testDb("alerts").where({ id: alert.id })).toHaveLength(0);
    expect(await testDb("alert_channel_memberships").where({ alertId: alert.id })).toHaveLength(0);
    expect(await testDb("alert_channels").whereIn("id", channelIds)).toHaveLength(0);
    expect(await testDb("alert_channel_recipients").whereIn("channelId", channelIds)).toHaveLength(0);
  };

  const nextReminderDate = async (secretId: string) => {
    const reminder = await getSecretReminder({ secretId, authToken });
    expect(reminder).not.toBeNull();
    return new Date(reminder?.nextReminderDate as string);
  };

  test("updating the reminder keeps channels added through the alert API", async () => {
    const secretId = await createSecret("KEEP_WEBHOOK");
    await setSecretReminder({ secretId, authToken, repeatDays: 30, message: "rotate it", recipients: [member.userId] });
    const [alert] = await reminderAlerts(secretId);
    expect(alert.name).toBe("Reminder for KEEP_WEBHOOK");
    expect(alert.channels).toEqual([
      expect.objectContaining({
        channelType: "email",
        recipients: [{ principalType: "user", principalId: member.userId }]
      })
    ]);

    await updateAlert({
      alertId: alert.id,
      authToken,
      body: {
        channels: [
          { id: alert.channels[0].id, name: alert.channels[0].name, channelType: "email" },
          { name: "Webhook", channelType: "webhook", config: { url: "https://example.com/reminders" } }
        ]
      }
    });

    await setSecretReminder({ secretId, authToken, repeatDays: 14 });

    const [updated] = await reminderAlerts(secretId);
    expect(updated.channels.map((channel) => channel.channelType).sort()).toEqual(["email", "webhook"]);
    expect(updated.channels.find((channel) => channel.channelType === "email")?.recipients).toEqual([
      { principalType: "project-members", principalId: projectId }
    ]);
    expect(await getSecretReminder({ secretId, authToken })).toMatchObject({
      repeatDays: 14,
      message: "rotate it",
      recipients: []
    });
  });

  test("the secret listing reports recipients from the reminder's alert", async () => {
    const secretId = await createSecret("LISTING");
    await setSecretReminder({ secretId, authToken, repeatDays: 30, recipients: [member.userId] });

    const res = await testServer.inject({
      method: "GET",
      url: "/api/v1/dashboard/secrets-details",
      headers: { authorization: `Bearer ${authToken}` },
      query: { projectId, environment: ENVIRONMENT, secretPath: "/", search: "LISTING", includeSecrets: "true" }
    });
    expect(res.statusCode).toBe(200);
    const [secret] = res.json().secrets as {
      secretReminderRecipients: { user: { id: string } }[];
      secretReminderRepeatDays: number;
    }[];
    expect(secret.secretReminderRepeatDays).toBe(30);
    expect(secret.secretReminderRecipients.map((recipient) => recipient.user.id)).toEqual([member.userId]);
  });

  test("moving a secret carries its reminder alert to the new secret", async () => {
    await createFolder({
      workspaceId: projectId,
      environmentSlug: ENVIRONMENT,
      secretPath: "/",
      name: "dest",
      authToken
    });
    const secretId = await createSecret("MOVE");
    await setSecretReminder({ secretId, authToken, repeatDays: 30, recipients: [member.userId] });
    const [before] = await reminderAlerts(secretId);

    const move = await testServer.inject({
      method: "POST",
      url: "/api/v4/secrets/move",
      headers: { authorization: `Bearer ${authToken}` },
      body: {
        projectId,
        sourceEnvironment: ENVIRONMENT,
        sourceSecretPath: "/",
        destinationEnvironment: ENVIRONMENT,
        destinationSecretPath: "/dest",
        secretIds: [secretId]
      }
    });
    expect(move.statusCode).toBe(200);

    const moved = await getSecretByNameV2({
      workspaceId: projectId,
      environmentSlug: ENVIRONMENT,
      secretPath: "/dest",
      key: "MOVE",
      authToken
    });
    expect(moved.id).not.toBe(secretId);
    expect((await reminderAlerts(moved.id)).map((alert) => alert.id)).toEqual([before.id]);
  });

  test(
    "the daily job emails a due reminder and moves its schedule forward",
    async () => {
      const secretId = await createSecret("DISPATCH");
      await setSecretReminder({
        secretId,
        authToken,
        repeatDays: 30,
        message: "rotate it",
        recipients: [member.userId]
      });
      const dueDate = await nextReminderDate(secretId);

      await runDailyReminders({ now: new Date() });
      expect(reminderEmailsFor("DISPATCH")).toHaveLength(0);

      await runDailyReminders({ now: dueDate });

      const [email] = await waitForReminderEmails("DISPATCH");
      expect(email.recipients).toEqual([member.username]);
      expect(JSON.stringify(email.substitutions)).toContain("rotate it");

      expect((await nextReminderDate(secretId)).getTime()).toBe(dueDate.getTime() + 30 * DAY_MS);
    },
    EMAIL_DELIVERY_TIMEOUT_MS
  );

  // Force-deleting a folder removes its secrets by cascade, which no reminder code sees. The API
  // cannot show the orphaned alert either (every read goes through its secret), so this reads the
  // alert row directly.
  test("the daily job reaps alerts whose secret was removed without the reminder code seeing it", async () => {
    const folder = await createFolder({
      workspaceId: projectId,
      environmentSlug: ENVIRONMENT,
      secretPath: "/",
      name: "reap",
      authToken
    });
    const secretId = await createSecret("REAP", { secretPath: "/reap" });
    await setSecretReminder({ secretId, authToken, repeatDays: 30 });
    const [alert] = await reminderAlerts(secretId);

    await deleteFolder({
      workspaceId: projectId,
      environmentSlug: ENVIRONMENT,
      secretPath: "/",
      id: folder.id,
      forceDelete: true,
      authToken
    });
    expect(await testDb("alerts").where({ id: alert.id })).toHaveLength(1);

    await reapOrphanedReminderAlerts();

    await expectAlertFullyRemoved(alert);
  });

  test("deleting a reminder removes its alert, channels and recipients", async () => {
    const secretId = await createSecret("DELETE_ME");
    await setSecretReminder({ secretId, authToken, repeatDays: 30, recipients: [member.userId] });
    const [alert] = await reminderAlerts(secretId);

    await deleteSecretReminder({ secretId, authToken });

    expect(await getSecretReminder({ secretId, authToken })).toBeNull();
    expect(await reminderAlerts(secretId)).toEqual([]);
    await expectAlertFullyRemoved(alert);
  });

  // Rows from before the migration have no API that creates them, so these tests seed the reminder
  // tables directly and check the result through the API.
  describe("migrating existing reminders", () => {
    const seedReminder = async (secretId: string, fields: { repeatDays: number; nextReminderDate: Date }) => {
      const [reminder] = await testDb("reminders")
        .insert({ secretId, ...fields })
        .returning("id");
      return reminder.id as string;
    };

    test("gives existing reminders an alert, keeping only recipients still in the project", async () => {
      const secretId = await createSecret("MIGRATE");
      const everyoneSecretId = await createSecret("MIGRATE_EVERYONE");
      const nobodyLeftSecretId = await createSecret("MIGRATE_NOBODY_LEFT");
      const outsider = await newUser("reminder-outsider");
      const dueDate = new Date(Date.now() + DAY_MS);
      const reminderId = await seedReminder(secretId, { repeatDays: 30, nextReminderDate: dueDate });
      await seedReminder(everyoneSecretId, { repeatDays: 7, nextReminderDate: dueDate });
      const nobodyLeftReminderId = await seedReminder(nobodyLeftSecretId, { repeatDays: 7, nextReminderDate: dueDate });
      await testDb("reminders_recipients").insert([
        { reminderId, userId: member.userId },
        { reminderId, userId: outsider.userId },
        { reminderId: nobodyLeftReminderId, userId: outsider.userId }
      ]);

      await migrateRemindersToAlerts(testDb);

      const [alert] = await reminderAlerts(secretId);
      expect(alert).toMatchObject({ name: "Reminder for MIGRATE", triggerType: "event" });
      expect(alert.channels).toHaveLength(1);
      expect(alert.channels[0].recipients).toEqual([{ principalType: "user", principalId: member.userId }]);
      // The API does not report who created an alert.
      expect(await testDb("alerts").where({ id: alert.id }).first()).toMatchObject({
        createdByActorType: "platform",
        createdByActorId: null
      });

      // A reminder that never listed anyone keeps its meaning: everyone in the project.
      const [everyoneAlert] = await reminderAlerts(everyoneSecretId);
      expect(everyoneAlert.channels[0].recipients).toEqual([
        { principalType: "project-members", principalId: projectId }
      ]);

      // One whose listed recipients have all left gets no alert, rather than one to people nobody chose.
      expect(await reminderAlerts(nobodyLeftSecretId)).toHaveLength(0);
    });

    test("rerunning does not duplicate alerts", async () => {
      const secretId = await createSecret("MIGRATE_TWICE");
      await seedReminder(secretId, { repeatDays: 7, nextReminderDate: new Date(Date.now() + DAY_MS) });

      await migrateRemindersToAlerts(testDb);
      await migrateRemindersToAlerts(testDb);

      expect(await reminderAlerts(secretId)).toHaveLength(1);
    });

    test("resumes long-dead recurring reminders on their schedule without sending", async () => {
      const secretId = await createSecret("MIGRATE_STALE");
      const startOfToday = startOfUtcDay(new Date());
      // Died 100 days ago on a 30 day schedule: the next date on that schedule is 20 days from today.
      await seedReminder(secretId, {
        repeatDays: 30,
        nextReminderDate: new Date(startOfToday.getTime() - 100 * DAY_MS)
      });

      await migrateRemindersToAlerts(testDb);
      await runDailyReminders({ now: new Date() });

      expect((await nextReminderDate(secretId)).getTime()).toBe(startOfToday.getTime() + 20 * DAY_MS);
      expect(reminderEmailsFor("MIGRATE_STALE")).toHaveLength(0);
    });
  });
});
