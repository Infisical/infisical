import { auditLogStreamOutboxTuning } from "e2e-test/fakes/audit-log-stream-outbox-constants";
import { eventOutbox } from "e2e-test/fakes/event-outbox-queue";
import { createFakeWebhookServer, TFakeWebhookServer } from "e2e-test/fakes/webhook-destination";
import { TTestSmtpService } from "e2e-test/mocks/smtp";
import { createAlert } from "e2e-test/testUtils/alerts";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { overrideLicenseFeatures } from "e2e-test/testUtils/license";
import { pollUntil } from "e2e-test/testUtils/poll";
import { createSecretV2 } from "e2e-test/testUtils/secrets";
import { addUserMembership, createUser, deleteUsers } from "e2e-test/testUtils/users";

import { OrgMembershipRole } from "@app/db/schemas";
import {
  AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT,
  AUDIT_LOG_STREAM_RESOURCE_TYPE
} from "@app/ee/services/audit-log-stream/audit-log-stream-events";
import { ALERT_EVENT_CONSUMER } from "@app/services/alert/alert-event-consumer";

const smtp = () => (globalThis as unknown as { testSmtp: TTestSmtpService }).testSmtp;

// The one end-to-end check that a stream which cannot deliver ends in a notification. It goes
// through the public API from stream creation to the alert email; the edge cases (rollback,
// repeat failures, recovery) are covered in audit-log-stream-outbox.integration.spec.ts.
//
// The debounce and retry limit are shortened by a fake (see fakes/audit-log-stream-outbox-constants.ts)
// so the first failed delivery exhausts the row, instead of waiting out five backed-off attempts.
describe("Audit log stream failure alert", () => {
  let orgId: string;
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;
  let restoreLicense: () => void;
  let streamReceiver: TFakeWebhookServer;
  let recipient: { userId: string; username: string };

  beforeAll(async () => {
    restoreLicense = overrideLicenseFeatures({
      auditLogs: true,
      auditLogsRetentionDays: 30,
      auditLogStreams: true
    });
    auditLogStreamOutboxTuning.set({ flushDebounceMs: 1_000, maxAttempts: 1 });
    streamReceiver = await createFakeWebhookServer();
    ({ orgId, projectId, authToken, cleanup } = await createIsolatedOrgAndProject("audit-log-stream-failure-alert"));
    recipient = await createUser("stream-alert-recipient");
    await addUserMembership({ userId: recipient.userId, orgId, role: OrgMembershipRole.Member });
  });

  afterAll(async () => {
    await cleanup();
    await deleteUsers([recipient.userId]);
    await streamReceiver.stop();
    auditLogStreamOutboxTuning.reset();
    restoreLicense();
  });

  test("a stream whose destination keeps failing alerts the org", async () => {
    const streamRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/audit-log-streams/custom",
      headers: { authorization: `Bearer ${authToken}` },
      body: { credentials: { url: streamReceiver.url, headers: [] } }
    });
    expect(streamRes.statusCode, streamRes.payload).toBe(200);
    const streamId = streamRes.json().auditLogStream.id as string;

    // Creating a stream sends a test request, so the destination only starts failing afterwards.
    streamReceiver.reset();
    streamReceiver.setStatusCode(500);

    await createAlert({
      authToken,
      body: {
        name: "stream failure",
        resourceType: AUDIT_LOG_STREAM_RESOURCE_TYPE,
        eventType: AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT,
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

    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: "dev",
      secretPath: "/",
      key: "TRIGGER_AUDIT_LOG",
      value: "value",
      authToken
    });

    // The stream's first flush fails and drops the row. The alert event it emits is then delivered
    // by draining the event outbox here, rather than waiting for the relay's next tick.
    const [email] = await pollUntil({
      describe: "the delivery-failed alert email",
      read: async () => {
        await eventOutbox.drain(ALERT_EVENT_CONSUMER);
        return smtp()
          .getEmails()
          .filter((mail) => JSON.stringify(mail.substitutions).includes(streamId));
      },
      done: (emails) => emails.length > 0,
      timeoutMs: 30_000
    });

    expect(email.recipients).toEqual([recipient.username]);
  }, 40_000);
});
