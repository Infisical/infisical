import { seedData1 } from "@app/db/seed-data";
import { alertChannelDALFactory } from "@app/services/alert/alert-channel-dal";
import { alertChannelMembershipDALFactory } from "@app/services/alert/alert-channel-membership-dal";
import { alertDALFactory } from "@app/services/alert/alert-dal";
import { alertEventConsumerFactory } from "@app/services/alert/alert-event-consumer";
import { alertProviderRegistryFactory } from "@app/services/alert/alert-provider-registry";
import { alertServiceFactory } from "@app/services/alert/alert-service";
import { secretReminderAlertDALFactory } from "@app/services/alert/providers/secret-reminder-alert-dal";
import { secretReminderAlertProviderFactory } from "@app/services/alert/providers/secret-reminder-alert-provider";
import { eventOutboxDALFactory } from "@app/services/event-outbox/event-outbox-dal";
import { eventOutboxRegistryFactory } from "@app/services/event-outbox/event-outbox-registry";
import { eventOutboxServiceFactory } from "@app/services/event-outbox/event-outbox-service";
import { reminderDALFactory } from "@app/services/reminder/reminder-dal";
import { reminderServiceFactory } from "@app/services/reminder/reminder-service";

import { createFolder } from "../../testUtils/folders";
import { createSecretV2, deleteSecretV2 } from "../../testUtils/secrets";

const RESOURCE_TYPE = "secret.reminder";
const EVENT_TYPE = "secret.reminder.due";
const projectId = seedData1.projectV3.id;
const environment = seedData1.environment.slug;
const auth = () => ({ authorization: `Bearer ${jwtAuthToken}` });

// Services are decorated inside the routes plugin, out of a spec's reach, so the cron's two entry
// points are built here from the real DALs and the real event outbox registration. The stubbed
// dependencies are ones dispatch and reaping never call.
const buildReminderCron = () => {
  const db = testDb as never;
  const alertDAL = alertDALFactory(db);
  const alertProviderRegistry = alertProviderRegistryFactory();
  alertProviderRegistry.register(
    secretReminderAlertProviderFactory({
      secretReminderAlertDAL: secretReminderAlertDALFactory(db),
      folderDAL: {} as never,
      permissionService: {} as never
    })
  );
  const eventOutboxRegistry = eventOutboxRegistryFactory();
  eventOutboxRegistry.register(
    alertEventConsumerFactory({ alertDAL, alertEngine: {} as never, alertProviderRegistry })
  );
  return reminderServiceFactory({
    reminderDAL: reminderDALFactory(db),
    eventEmitter: eventOutboxServiceFactory({ eventOutboxDAL: eventOutboxDALFactory(db), eventOutboxRegistry }),
    alertService: alertServiceFactory({
      alertDAL,
      alertChannelDAL: alertChannelDALFactory(db),
      alertChannelMembershipDAL: alertChannelMembershipDALFactory(db),
      alertChannelService: {} as never,
      kmsService: {} as never,
      alertProviderRegistry
    }),
    projectDAL: {} as never,
    permissionService: {} as never,
    secretV2BridgeDAL: {} as never,
    folderDAL: {} as never
  });
};

const createSecret = async (key: string, secretPath = "/") => {
  await createSecretV2({
    workspaceId: projectId,
    environmentSlug: environment,
    secretPath,
    key,
    value: "value",
    authToken: jwtAuthToken
  });
  const row = await testDb("secrets_v2").where({ key, type: "shared" }).first();
  return row.id as string;
};

const setReminder = async (secretId: string, body: Record<string, unknown>) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/reminders/secrets/${secretId}`,
    headers: auth(),
    body
  });
  expect(res.statusCode).toBe(200);
};

const reminderAlert = async (secretId: string) => {
  const res = await testServer.inject({
    method: "GET",
    url: "/api/v1/alerts",
    headers: auth(),
    query: { resourceType: RESOURCE_TYPE, projectId, resourceId: secretId }
  });
  expect(res.statusCode).toBe(200);
  const { alerts } = res.json();
  return alerts;
};

const reminderAlertRows = (secretId: string) =>
  testDb("alerts").where({ resourceType: RESOURCE_TYPE, resourceId: secretId });

describe("Secret reminders delivered through alerts", async () => {
  test("setting a reminder creates its alert with an email channel to the recipients", async () => {
    const secretId = await createSecret("REMINDER_E2E_CREATE");
    await setReminder(secretId, { repeatDays: 30, message: "rotate it", recipients: [seedData1.id] });

    const [alert] = await reminderAlert(secretId);
    expect(alert.name).toBe("Reminder for REMINDER_E2E_CREATE");
    expect(alert.channels).toHaveLength(1);
    expect(alert.channels[0]).toMatchObject({
      channelType: "email",
      recipients: [{ principalType: "user", principalId: seedData1.id }]
    });

    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/reminders/secrets/${secretId}`,
      headers: auth()
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().reminder).toMatchObject({ repeatDays: 30, message: "rotate it", recipients: [seedData1.id] });
  });

  test("a reminder with no recipients notifies all project members", async () => {
    const secretId = await createSecret("REMINDER_E2E_EVERYONE");
    await setReminder(secretId, { repeatDays: 7 });

    const [alert] = await reminderAlert(secretId);
    expect(alert.channels[0].recipients).toEqual([{ principalType: "project-members", principalId: projectId }]);
  });

  test("updating the reminder keeps channels added through the alert API", async () => {
    const secretId = await createSecret("REMINDER_E2E_KEEP_WEBHOOK");
    await setReminder(secretId, { repeatDays: 30, recipients: [seedData1.id] });
    const [alert] = await reminderAlert(secretId);

    const patch = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/alerts/${alert.id}`,
      headers: auth(),
      body: {
        channels: [
          { id: alert.channels[0].id, name: alert.channels[0].name, channelType: "email" },
          { name: "Webhook", channelType: "webhook", config: { url: "https://example.com/reminders" } }
        ]
      }
    });
    expect(patch.statusCode).toBe(200);

    await setReminder(secretId, { repeatDays: 14 });

    const [updated] = await reminderAlert(secretId);
    expect(updated.channels.map((channel) => channel.channelType).sort()).toEqual(["email", "webhook"]);
    expect(updated.channels.find((channel) => channel.channelType === "email")?.recipients).toEqual([
      { principalType: "project-members", principalId: projectId }
    ]);
  });

  test("the secret listing reports recipients from the reminder's alert", async () => {
    const secretId = await createSecret("REMINDER_E2E_LISTING");
    await setReminder(secretId, { repeatDays: 30, recipients: [seedData1.id] });

    const res = await testServer.inject({
      method: "GET",
      url: "/api/v1/dashboard/secrets-details",
      headers: auth(),
      query: {
        projectId,
        environment,
        secretPath: "/",
        search: "REMINDER_E2E_LISTING",
        includeSecrets: "true"
      }
    });
    expect(res.statusCode).toBe(200);
    const [secret] = res.json().secrets as {
      secretReminderRecipients: { user: { id: string } }[];
      secretReminderRepeatDays: number;
    }[];
    expect(secret.secretReminderRepeatDays).toBe(30);
    expect(secret.secretReminderRecipients.map((recipient) => recipient.user.id)).toEqual([seedData1.id]);
  });

  test("listing reminder alerts across a project is refused", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: "/api/v1/alerts",
      headers: auth(),
      query: { resourceType: RESOURCE_TYPE, projectId }
    });
    expect(res.statusCode).toBe(400);
  });

  test("moving a secret carries its reminder alert to the new secret", async () => {
    await createFolder({
      workspaceId: projectId,
      environmentSlug: environment,
      secretPath: "/",
      name: "reminder-move-dest",
      authToken: jwtAuthToken
    });
    const secretId = await createSecret("REMINDER_E2E_MOVE");
    await setReminder(secretId, { repeatDays: 30, recipients: [seedData1.id] });
    const [before] = await reminderAlert(secretId);

    const move = await testServer.inject({
      method: "POST",
      url: "/api/v4/secrets/move",
      headers: auth(),
      body: {
        projectId,
        sourceEnvironment: environment,
        sourceSecretPath: "/",
        destinationEnvironment: environment,
        destinationSecretPath: "/reminder-move-dest",
        secretIds: [secretId]
      }
    });
    expect(move.statusCode).toBe(200);

    const moved = await testDb("secrets_v2").where({ key: "REMINDER_E2E_MOVE", type: "shared" }).first();
    expect(moved.id).not.toBe(secretId);
    expect(await reminderAlertRows(secretId)).toHaveLength(0);
    const movedAlerts = await reminderAlertRows(moved.id as string);
    expect(movedAlerts.map((alert) => alert.id)).toEqual([before.id]);
  });

  test("the cron emits one event per due reminder and moves the schedule forward", async () => {
    const secretId = await createSecret("REMINDER_E2E_DISPATCH");
    await setReminder(secretId, { repeatDays: 30, message: "rotate it" });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await testDb("reminders").where({ secretId }).update({ nextReminderDate: today });

    await buildReminderCron().dispatchDueReminders();

    const occurrenceDate = today.toISOString().slice(0, 10);
    const events = await testDb("event_outbox").where({
      eventType: EVENT_TYPE,
      idempotencyKey: `${EVENT_TYPE}:${secretId}:${occurrenceDate}`
    });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      resourceType: RESOURCE_TYPE,
      resourceId: secretId,
      targetIds: [secretId],
      note: "rotate it",
      repeatDays: 30,
      occurrenceDate
    });

    const reminder = await testDb("reminders").where({ secretId }).first();
    expect(new Date(reminder.nextReminderDate).getTime()).toBe(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  });

  test("a one-time reminder is removed once it fires, but its alert stays as the record", async () => {
    const secretId = await createSecret("REMINDER_E2E_ONE_OFF");
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await setReminder(secretId, { nextReminderDate: tomorrow });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await testDb("reminders").where({ secretId }).update({ nextReminderDate: today });
    await buildReminderCron().dispatchDueReminders();

    expect(await testDb("reminders").where({ secretId })).toHaveLength(0);
    expect(await reminderAlertRows(secretId)).toHaveLength(1);
  });

  test("deleting the reminder deletes its alert", async () => {
    const secretId = await createSecret("REMINDER_E2E_DELETE_REMINDER");
    await setReminder(secretId, { repeatDays: 30 });

    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/reminders/secrets/${secretId}`,
      headers: auth()
    });
    expect(res.statusCode).toBe(200);
    expect(await reminderAlertRows(secretId)).toHaveLength(0);
  });

  test("the cron reaps alerts whose secret was deleted", async () => {
    const secretId = await createSecret("REMINDER_E2E_REAP");
    await setReminder(secretId, { repeatDays: 30 });
    const [alert] = await reminderAlert(secretId);

    await deleteSecretV2({
      workspaceId: projectId,
      environmentSlug: environment,
      secretPath: "/",
      key: "REMINDER_E2E_REAP",
      authToken: jwtAuthToken
    });
    // A second orphan whose secret never existed shows the sweep does not rely on any delete path.
    await testDb("alerts").insert({
      ...(await testDb("alerts").where({ id: alert.id }).first()),
      id: undefined,
      resourceId: "11111111-1111-4111-8111-111111111111",
      name: "orphan"
    });

    await buildReminderCron().reapOrphanedReminderAlerts();

    expect(await reminderAlertRows(secretId)).toHaveLength(0);
    expect(await reminderAlertRows("11111111-1111-4111-8111-111111111111")).toHaveLength(0);
  });
});
