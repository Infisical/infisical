// Health alerts are raised by a cron that runs every five minutes, and a relay only counts as down
// once its heartbeat is an hour old. The test backdates the stored heartbeat, which is the state
// that wait would leave, and runs the cron's handler itself rather than waiting for the schedule.
// Notifications are written straight to the table, which is what the notification queue's worker does.
// Gateway alert events go into the real outbox under the alert consumer, so the server's consumer delivers them.
import crypto from "node:crypto";

import { OrgMembershipRole, TableName } from "@app/db/schemas";
import { gatewayV2DalFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import {
  GATEWAY_OFFLINE_EVENT,
  GATEWAY_RESOURCE_TYPE,
  GatewayOfflinePayloadSchema
} from "@app/ee/services/gateway-v2/gateway-v2-events";
import { gatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { relayDalFactory } from "@app/ee/services/relay/relay-dal";
import { relayServiceFactory } from "@app/ee/services/relay/relay-service";
import { initLogger } from "@app/lib/logger";
import { ALERT_EVENT_CONSUMER } from "@app/services/alert/alert-event-consumer";
import { eventOutboxDALFactory } from "@app/services/event-outbox/event-outbox-dal";
import { eventOutboxRegistryFactory } from "@app/services/event-outbox/event-outbox-registry";
import { eventOutboxServiceFactory } from "@app/services/event-outbox/event-outbox-service";
import { notificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { userNotificationDALFactory } from "@app/services/notification/user-notification-dal";
import { orgDALFactory } from "@app/services/org/org-dal";
import { userDALFactory } from "@app/services/user/user-dal";

import { eventOutbox } from "e2e-test/fakes/event-outbox-queue";
import { TTestSmtpService } from "e2e-test/mocks/smtp";
import { createAlert } from "e2e-test/testUtils/alerts";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { pollUntil } from "e2e-test/testUtils/poll";
import { addUserMembership, createUser, deleteUsers } from "e2e-test/testUtils/users";

type TSentMail = { recipients: string[]; subjectLine: string; substitutions: Record<string, unknown> };

const smtp = () => (globalThis as unknown as { testSmtp: TTestSmtpService }).testSmtp;

const eventOutboxRegistry = eventOutboxRegistryFactory();
eventOutboxRegistry.register({
  name: ALERT_EVENT_CONSUMER,
  dataSchema: GatewayOfflinePayloadSchema as never,
  subscribesTo: (eventType) => eventType === GATEWAY_OFFLINE_EVENT,
  handle: async () => []
});
const eventEmitter = eventOutboxServiceFactory({
  eventOutboxDAL: eventOutboxDALFactory(testDb),
  eventOutboxRegistry
});

const buildServices = () => {
  const userNotificationDAL = userNotificationDALFactory(testDb);
  const notificationService = notificationServiceFactory({
    userNotificationDAL,
    notificationQueue: {
      pushUserNotifications: async (data) => {
        await userNotificationDAL.batchInsert(data);
      }
    }
  });
  const sent: TSentMail[] = [];
  const smtpService = {
    sendMail: async (mail: TSentMail) => {
      sent.push(mail);
    }
  };
  const orgDAL = orgDALFactory(testDb);
  const gatewayV2DAL = gatewayV2DalFactory(testDb);

  const gatewayV2Service = gatewayV2ServiceFactory({
    gatewayV2DAL,
    orgDAL,
    notificationService,
    eventEmitter
  } as unknown as Parameters<typeof gatewayV2ServiceFactory>[0]);
  const relayService = relayServiceFactory({
    relayDAL: relayDalFactory(testDb),
    orgDAL,
    notificationService,
    smtpService,
    userDAL: userDALFactory(testDb),
    gatewayV2DAL
  } as unknown as Parameters<typeof relayServiceFactory>[0]);

  return { gatewayV2Service, relayService, sent };
};

const listNotifications = async (authToken: string) => {
  const res = await testServer.inject({
    method: "GET",
    url: "/api/v1/notifications/user",
    headers: { authorization: `Bearer ${authToken}` }
  });
  expect(res.statusCode, res.payload).toBe(200);
  return res.json().notifications as { type: string; title: string; body: string }[];
};

const createGateway = async (authToken: string) => {
  const name = `gw-${crypto.randomUUID().slice(0, 8)}`;
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v3/gateways",
    headers: { authorization: `Bearer ${authToken}` },
    body: { name, authMethod: { method: "token" } }
  });
  expect(res.statusCode, res.payload).toBe(200);
  return { id: (res.json().gateway?.id ?? res.json().id) as string, name };
};

const offlineEventsFor = async (gatewayId: string) => {
  const rows = await testDb(TableName.EventOutbox)
    .where({ consumer: ALERT_EVENT_CONSUMER, eventType: GATEWAY_OFFLINE_EVENT })
    .select("payload");
  return rows.filter((row) => ((row.payload as { targetIds: string[] }).targetIds ?? []).includes(gatewayId));
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

describe("Gateway and relay health alerts", () => {
  let orgId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    initLogger();
    ({ orgId, authToken, cleanup } = await createIsolatedOrgAndProject("health-alert"));
  });

  afterAll(async () => {
    await cleanup();
  });

  test("a gateway whose last probe failed raises one notification for the org admins", async () => {
    const { gatewayV2Service } = buildServices();
    const down = await createGateway(authToken);
    const neverConnected = await createGateway(authToken);
    await testDb(TableName.GatewayV2)
      .where({ id: down.id })
      .update({ heartbeat: new Date(Date.now() - 10 * 60_000), heartbeatTTL: 0 });

    await gatewayV2Service.healthcheckNotify();

    const alerts = (await listNotifications(authToken)).filter((n) => n.type === NotificationType.GATEWAY_HEALTH_ALERT);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe("Gateway Health Alert");
    expect(alerts[0].body).toContain(`"${down.name}"`);
    expect(alerts[0].body).not.toContain(neverConnected.name);
    const stored = await testDb(TableName.GatewayV2).where({ id: down.id }).first();
    expect(stored?.healthAlertedAt).toBeTruthy();
    expect(await offlineEventsFor(down.id)).toHaveLength(1);
    expect(await offlineEventsFor(neverConnected.id)).toHaveLength(0);

    await gatewayV2Service.healthcheckNotify();

    const again = (await listNotifications(authToken)).filter((n) => n.type === NotificationType.GATEWAY_HEALTH_ALERT);
    expect(again).toHaveLength(1);
    expect(await offlineEventsFor(down.id)).toHaveLength(1);
  });

  test("a gateway that stays down does not alert again, even after an hour", async () => {
    const { gatewayV2Service } = buildServices();
    const gateway = await createGateway(authToken);
    await testDb(TableName.GatewayV2)
      .where({ id: gateway.id })
      .update({ heartbeat: minutesAgo(180), heartbeatTTL: 0, healthAlertedAt: minutesAgo(120) });

    await gatewayV2Service.healthcheckNotify();

    expect(await offlineEventsFor(gateway.id)).toHaveLength(0);
  });

  test("a gateway alerts again once it has recovered and an hour has passed", async () => {
    const { gatewayV2Service } = buildServices();
    const gateway = await createGateway(authToken);
    await testDb(TableName.GatewayV2)
      .where({ id: gateway.id })
      .update({ heartbeat: minutesAgo(60), heartbeatTTL: 0, healthAlertedAt: minutesAgo(120) });

    await gatewayV2Service.healthcheckNotify();

    const events = await offlineEventsFor(gateway.id);
    expect(events).toHaveLength(1);
    const payload = GatewayOfflinePayloadSchema.parse(events[0].payload);
    expect(payload.gateways).toEqual([{ id: gateway.id, lastSeenAt: expect.any(Date) as Date }]);
  });

  test("a gateway that recovers and drops again within the hour waits for the hour", async () => {
    const { gatewayV2Service } = buildServices();
    const gateway = await createGateway(authToken);
    await testDb(TableName.GatewayV2)
      .where({ id: gateway.id })
      .update({ heartbeat: minutesAgo(5), heartbeatTTL: 0, healthAlertedAt: minutesAgo(10) });

    await gatewayV2Service.healthcheckNotify();

    expect(await offlineEventsFor(gateway.id)).toHaveLength(0);
  });

  test("an org-wide gateway alert emails its recipients when a gateway goes offline", async () => {
    const { gatewayV2Service } = buildServices();
    const recipient = await createUser("gateway-alert-recipient");
    await addUserMembership({ userId: recipient.userId, orgId, role: OrgMembershipRole.Member });

    try {
      await createAlert({
        authToken,
        body: {
          name: "gateway offline",
          resourceType: GATEWAY_RESOURCE_TYPE,
          eventType: GATEWAY_OFFLINE_EVENT,
          channels: [
            {
              name: "Email",
              channelType: "email",
              config: {},
              recipients: [{ principalType: "user", principalId: recipient.userId }]
            }
          ]
        }
      });

      const gateway = await createGateway(authToken);
      await testDb(TableName.GatewayV2)
        .where({ id: gateway.id })
        .update({ heartbeat: minutesAgo(10), heartbeatTTL: 0 });

      await gatewayV2Service.healthcheckNotify();

      const [email] = await pollUntil({
        describe: "the gateway offline alert email",
        read: async () => {
          await eventOutbox.drain(ALERT_EVENT_CONSUMER);
          return smtp()
            .getEmails()
            .filter((mail) => JSON.stringify(mail.substitutions).includes(gateway.id));
        },
        done: (emails) => emails.length > 0,
        timeoutMs: 30_000
      });

      expect(email.recipients).toEqual([recipient.username]);
      expect(JSON.stringify(email.substitutions)).toContain(gateway.name);
    } finally {
      await deleteUsers([recipient.userId]);
    }
  }, 40_000);

  test("an org relay silent for over an hour raises one notification for the org admins", async () => {
    const { relayService } = buildServices();
    const name = `rl-${crypto.randomUUID().slice(0, 8)}`;
    const fresh = `rl-${crypto.randomUUID().slice(0, 8)}`;
    await testDb(TableName.Relay).insert([
      { orgId, name, host: `${name}.relay.test`, heartbeat: new Date(Date.now() - 2 * 60 * 60_000) },
      { orgId, name: fresh, host: `${fresh}.relay.test`, heartbeat: new Date() }
    ]);

    await relayService.healthcheckNotify();

    const alerts = (await listNotifications(authToken)).filter((n) => n.type === NotificationType.RELAY_HEALTH_ALERT);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe("Relay Health Alert");
    expect(alerts[0].body).toContain(`"${name}"`);
    expect(alerts[0].body).not.toContain(fresh);

    await relayService.healthcheckNotify();

    const again = (await listNotifications(authToken)).filter((n) => n.type === NotificationType.RELAY_HEALTH_ALERT);
    expect(again).toHaveLength(1);
  });

  test("an instance relay silent for over an hour is mailed to the server admins", async () => {
    const { relayService, sent } = buildServices();
    const admin = await createUser("relay-health-admin");
    await testDb(TableName.Users).where({ id: admin.userId }).update({ superAdmin: true });
    const name = `rl-${crypto.randomUUID().slice(0, 8)}`;
    const [relay] = await testDb(TableName.Relay)
      .insert({ name, host: `${name}.relay.test`, heartbeat: new Date(Date.now() - 2 * 60 * 60_000) })
      .returning("id");

    try {
      await relayService.healthcheckNotify();

      const mail = sent.find(
        (m) => m.subjectLine === "Relay Health Alert" && String(m.substitutions.names).includes(name)
      );
      expect(mail?.recipients).toContain(admin.username);
      expect(mail?.substitutions.type).toBe("instance-relay");
    } finally {
      await testDb(TableName.Relay)
        .where({ id: (relay as { id: string }).id })
        .delete();
      await deleteUsers([admin.userId]);
    }
  });
});
