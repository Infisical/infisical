import { OrgMembershipRole, ProjectMembershipRole } from "@app/db/schemas";

import { createAlert, deleteAlert, getAlert, listAlerts, updateAlert } from "../../testUtils/alerts";
import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { addIdentityToProject, createIdentityActor } from "../../testUtils/identities";
import { addUserMembership, createUser, deleteUsers } from "../../testUtils/users";

const RESOURCE_TYPE = "identity.authentication";
const EVENT_TYPE = "identity.authentication.expiry";

describe("Alerts API", () => {
  let orgId: string;
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;
  let recipient: { userId: string; username: string };
  let identityId: string;

  beforeEach(async () => {
    ({ orgId, projectId, authToken, cleanup } = await createIsolatedOrgAndProject("alerts"));
    recipient = await createUser("alert-recipient");
    await addUserMembership({ userId: recipient.userId, orgId, role: OrgMembershipRole.Member });
    await addUserMembership({ userId: recipient.userId, orgId, projectId, role: ProjectMembershipRole.Member });
    ({ identityId } = await createIdentityActor({ orgId, authToken }));
    await addIdentityToProject({ projectId, identityId, role: ProjectMembershipRole.Admin, authToken });
  });

  afterEach(async () => {
    await cleanup();
    await deleteUsers([recipient.userId]);
  });

  const emailChannel = () => ({
    name: "Email",
    channelType: "email",
    config: {},
    recipients: [{ principalType: "user", principalId: recipient.userId }]
  });
  const webhookChannel = { name: "Webhook", channelType: "webhook", config: { url: "https://example.com/hook" } };

  const identityAlert = (opts: { name: string; projectId?: string; channels?: Record<string, unknown>[] }) => ({
    name: opts.name,
    resourceType: RESOURCE_TYPE,
    resourceId: identityId,
    eventType: EVENT_TYPE,
    condition: { alertBefore: "30d" },
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
    channels: opts.channels ?? [emailChannel()]
  });

  test("an org listing returns only org-level alerts, and a project listing only that project's", async () => {
    const orgAlert = await createAlert({ body: identityAlert({ name: "org-level" }), authToken });
    const projectAlert = await createAlert({ body: identityAlert({ name: "project-level", projectId }), authToken });

    const orgListing = await listAlerts({ resourceType: RESOURCE_TYPE, authToken });
    expect(orgListing.map((alert) => alert.id)).toEqual([orgAlert.id]);

    const projectListing = await listAlerts({ resourceType: RESOURCE_TYPE, projectId, authToken });
    expect(projectListing.map((alert) => alert.id)).toEqual([projectAlert.id]);
  });

  // The API cannot show a channel that no alert references, so the channel rows are read directly.
  test("updating channels keeps the ones referenced, removes the rest, and adds new ones", async () => {
    const alert = await createAlert({
      body: identityAlert({ name: "reconcile", channels: [emailChannel(), webhookChannel] }),
      authToken
    });
    const email = alert.channels.find((channel) => channel.channelType === "email")!;
    const webhook = alert.channels.find((channel) => channel.channelType === "webhook")!;

    const updated = await updateAlert({
      alertId: alert.id,
      authToken,
      body: {
        channels: [
          { id: email.id, name: "Renamed email", channelType: "email" },
          { name: "Slack", channelType: "slack", config: { webhookUrl: "https://hooks.slack.com/services/T0/B0/x" } }
        ]
      }
    });

    expect(updated.channels.map((channel) => channel.channelType).sort()).toEqual(["email", "slack"]);
    const keptEmail = updated.channels.find((channel) => channel.channelType === "email")!;
    expect(keptEmail).toMatchObject({ id: email.id, name: "Renamed email" });
    expect(keptEmail.recipients).toEqual([{ principalType: "user", principalId: recipient.userId }]);
    expect(await testDb("alert_channels").where({ id: webhook.id })).toHaveLength(0);
  });

  test("updating with another alert's channel id is refused", async () => {
    const first = await createAlert({ body: identityAlert({ name: "first" }), authToken });
    const second = await createAlert({ body: identityAlert({ name: "second", projectId }), authToken });

    const res = await updateAlert({
      alertId: first.id,
      authToken,
      body: { channels: [{ id: second.channels[0].id, name: "Stolen", channelType: "email" }] }
    }).raw();

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe(`Channel '${second.channels[0].id}' does not belong to this alert`);
    expect((await getAlert({ alertId: second.id, authToken })).channels.map((channel) => channel.id)).toEqual([
      second.channels[0].id
    ]);
  });

  // As above, the channel and recipient rows of a deleted alert are only visible in the database.
  test("deleting an alert removes its channels and their recipients", async () => {
    const alert = await createAlert({
      body: identityAlert({ name: "delete", channels: [emailChannel(), webhookChannel] }),
      authToken
    });
    const channelIds = alert.channels.map((channel) => channel.id);

    await deleteAlert({ alertId: alert.id, authToken });

    expect((await getAlert({ alertId: alert.id, authToken }).raw()).statusCode).toBe(404);
    expect(await testDb("alert_channels").whereIn("id", channelIds)).toHaveLength(0);
    expect(await testDb("alert_channel_recipients").whereIn("channelId", channelIds)).toHaveLength(0);
  });

  test("two concurrent creates of the same alert leave one, and the other gets a readable error", async () => {
    const body = identityAlert({ name: "concurrent" });
    const results = await Promise.all([createAlert({ body, authToken }).raw(), createAlert({ body, authToken }).raw()]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([200, 400]);
    expect(results.find((res) => res.statusCode === 400)?.json().message).toMatch(/already exists/);
    expect(await listAlerts({ resourceType: RESOURCE_TYPE, resourceId: identityId, authToken })).toHaveLength(1);
  });
});
