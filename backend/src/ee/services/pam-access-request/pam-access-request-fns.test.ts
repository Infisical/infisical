import { PamNotificationEvent } from "../pam/pam-enums";
import { getSlackSendTargets, TFolderNotificationConfigRow } from "./pam-access-request-fns";

const baseConfig = (overrides: Partial<TFolderNotificationConfigRow> = {}): TFolderNotificationConfigRow => ({
  workflowIntegrationId: "integration-1",
  integration: "slack",
  status: "installed",
  channels: [{ id: "C123", name: "access-requests" }],
  events: [PamNotificationEvent.AccessRequested],
  ...overrides
});

describe("getSlackSendTargets", () => {
  test("returns channel ids for a subscribed slack config", () => {
    const targets = getSlackSendTargets([baseConfig()], PamNotificationEvent.AccessRequested);
    expect(targets).toEqual([{ workflowIntegrationId: "integration-1", channelIds: ["C123"] }]);
  });

  test("skips configs not subscribed to the event", () => {
    const targets = getSlackSendTargets([baseConfig()], PamNotificationEvent.AccessRequestApproved);
    expect(targets).toEqual([]);
  });

  test("skips non-slack integrations", () => {
    const targets = getSlackSendTargets(
      [baseConfig({ integration: "microsoft-teams" })],
      PamNotificationEvent.AccessRequested
    );
    expect(targets).toEqual([]);
  });

  test("skips integrations that are not installed", () => {
    const targets = getSlackSendTargets([baseConfig({ status: "pending" })], PamNotificationEvent.AccessRequested);
    expect(targets).toEqual([]);
  });

  test("skips configs with no channels", () => {
    const targets = getSlackSendTargets([baseConfig({ channels: [] })], PamNotificationEvent.AccessRequested);
    expect(targets).toEqual([]);
  });

  test("tolerates malformed jsonb values", () => {
    const targets = getSlackSendTargets(
      [baseConfig({ channels: "not-an-array", events: { bogus: true } })],
      PamNotificationEvent.AccessRequested
    );
    expect(targets).toEqual([]);
  });

  test("fans out across multiple matching configs", () => {
    const targets = getSlackSendTargets(
      [
        baseConfig(),
        baseConfig({
          workflowIntegrationId: "integration-2",
          channels: [
            { id: "C456", name: "sre-oncall" },
            { id: "C789", name: "security" }
          ],
          events: [PamNotificationEvent.AccessRequested, PamNotificationEvent.AccessRequestDenied]
        })
      ],
      PamNotificationEvent.AccessRequested
    );
    expect(targets).toEqual([
      { workflowIntegrationId: "integration-1", channelIds: ["C123"] },
      { workflowIntegrationId: "integration-2", channelIds: ["C456", "C789"] }
    ]);
  });
});
