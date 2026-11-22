import { OrgMembershipRole, TableName } from "@app/db/schemas";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

// Expiry alerts are evaluated by the daily alert cron, which only enqueues one dispatch job per
// enabled alert. The test enqueues that job itself rather than waiting for midnight.
import { TTestSmtpService } from "e2e-test/mocks/smtp";
import { createAlert } from "e2e-test/testUtils/alerts";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createIdentityActor } from "e2e-test/testUtils/identities";
import { pollUntil } from "e2e-test/testUtils/poll";
import { addUserMembership, createUser, deleteUsers } from "e2e-test/testUtils/users";

const smtp = () => (globalThis as unknown as { testSmtp: TTestSmtpService }).testSmtp;
const queue = () => (globalThis as unknown as { testQueue: TQueueServiceFactory }).testQueue;

describe("Machine identity credential expiry alert", () => {
  let orgId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;
  let recipient: { userId: string; username: string };

  beforeAll(async () => {
    ({ orgId, authToken, cleanup } = await createIsolatedOrgAndProject("identity-expiry-alert"));
    recipient = await createUser("expiry-alert-recipient");
    await addUserMembership({ userId: recipient.userId, orgId, role: OrgMembershipRole.Member });
  });

  afterAll(async () => {
    await cleanup();
    await deleteUsers([recipient.userId]);
  });

  test("a client secret expiring within the lead time is mailed to the alert's recipients", async () => {
    const identity = await createIdentityActor({ orgId, authToken });
    const secretRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/auth/universal-auth/identities/${identity.identityId}/client-secrets`,
      headers: { authorization: `Bearer ${authToken}` },
      body: { description: "expiring-soon", ttl: 2 * 24 * 60 * 60 }
    });
    expect(secretRes.statusCode, secretRes.payload).toBe(200);

    const alertRes = await createAlert({
      authToken,
      body: {
        name: "credential expiry",
        resourceType: "identity.authentication",
        resourceId: identity.identityId,
        eventType: "identity.authentication.expiry",
        condition: { alertBefore: "7d" },
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
    const alertId = alertRes.id;

    await queue().queue(
      QueueName.AlertDispatch,
      QueueJobs.AlertDispatch,
      { alertId, scheduledAt: new Date().toISOString() },
      { jobId: `e2e-alert-dispatch-${alertId}`, removeOnComplete: true, removeOnFail: true, attempts: 1 }
    );

    const [email] = await pollUntil({
      describe: "the credential expiry alert email",
      read: () =>
        smtp()
          .getEmails()
          .filter((mail) => JSON.stringify(mail.substitutions).includes("expiring-soon")),
      done: (emails) => emails.length > 0,
      timeoutMs: 30_000
    });

    expect(email.recipients).toEqual([recipient.username]);
  }, 40_000);

  // The e2e environment serves no HTTPS endpoint, and a webhook channel takes only https URLs, so
  // the post itself cannot be observed here (the webhook channel's delivery is pinned black-box by
  // the auth-method-changed alert). What is pinned is that an expiry run targets the webhook channel.
  test("a client secret expiring within the lead time is dispatched to the alert's webhook channel", async () => {
    const identity = await createIdentityActor({ orgId, authToken });
    const secretRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/auth/universal-auth/identities/${identity.identityId}/client-secrets`,
      headers: { authorization: `Bearer ${authToken}` },
      body: { description: "expiring-to-webhook", ttl: 2 * 24 * 60 * 60 }
    });
    expect(secretRes.statusCode, secretRes.payload).toBe(200);

    const alertRes = await createAlert({
      authToken,
      body: {
        name: "credential expiry webhook",
        resourceType: "identity.authentication",
        resourceId: identity.identityId,
        eventType: "identity.authentication.expiry",
        condition: { alertBefore: "7d" },
        channels: [{ name: "Webhook", channelType: "webhook", config: { url: "https://hooks.example.test/expiry" } }]
      }
    });

    await queue().queue(
      QueueName.AlertDispatch,
      QueueJobs.AlertDispatch,
      { alertId: alertRes.id, scheduledAt: new Date().toISOString() },
      { jobId: `e2e-alert-dispatch-${alertRes.id}`, removeOnComplete: true, removeOnFail: true, attempts: 1 }
    );

    const targets = await pollUntil({
      describe: "the expiry run's channel targets",
      read: () =>
        testDb(TableName.AlertHistoryTarget)
          .join(
            TableName.AlertHistory,
            `${TableName.AlertHistory}.id`,
            `${TableName.AlertHistoryTarget}.alertHistoryId`
          )
          .where(`${TableName.AlertHistory}.alertId`, alertRes.id)
          .select(`${TableName.AlertHistoryTarget}.channelType`),
      done: (rows) => rows.length > 0,
      timeoutMs: 30_000
    });

    expect(targets.map((row) => row.channelType)).toEqual(["webhook"]);
  }, 40_000);
});
