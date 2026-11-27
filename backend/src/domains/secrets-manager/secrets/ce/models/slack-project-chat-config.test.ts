import { RuleViolationError } from "@app/domains/lib/errors";

import { SecretsChatEvent } from "./secrets-chat-event";
import { SlackProjectChatConfig } from "./slack-project-chat-config";

const settings = (overrides: Partial<Parameters<typeof SlackProjectChatConfig.create>[0]> = {}) => ({
  projectId: "project-1",
  integrationId: "integration-1",
  isAccessRequestNotificationEnabled: true,
  accessRequestChannels: "C1",
  isSecretRequestNotificationEnabled: true,
  secretRequestChannels: "C2",
  isSecretSyncErrorNotificationEnabled: true,
  secretSyncErrorChannels: "C3",
  ...overrides
});

describe("SlackProjectChatConfig.create", () => {
  test("should store the channel ids trimmed and joined with a comma and a space", () => {
    // Setup
    const input = settings({ accessRequestChannels: " C1 ,C2,  C3 " });

    // Action
    const config = SlackProjectChatConfig.create(input);

    // Assert
    expect(config.toJSON().accessRequestChannels).toBe("C1, C2, C3");
  });

  test("should treat missing channels as none", () => {
    // Setup
    const input = settings({ secretSyncErrorChannels: undefined });

    // Action
    const config = SlackProjectChatConfig.create(input);

    // Assert
    expect(config.toJSON().secretSyncErrorChannels).toBe("");
  });

  test("should refuse more than 20 channels for an event", () => {
    // Setup
    const channels = Array.from({ length: 21 }, (_, i) => `C${i}`).join(",");

    // Action
    const create = () => SlackProjectChatConfig.create(settings({ secretRequestChannels: channels }));

    // Assert
    expect(create).toThrow(RuleViolationError);
    expect(create).toThrow("You can only select up to 20 slack channels");
  });

  test("should accept exactly 20 channels", () => {
    // Setup
    const channels = Array.from({ length: 20 }, (_, i) => `C${i}`).join(",");

    // Action
    const config = SlackProjectChatConfig.create(settings({ secretRequestChannels: channels }));

    // Assert
    expect(config.channelsFor(SecretsChatEvent.SecretChangeRequest)).toHaveLength(20);
  });
});

describe("SlackProjectChatConfig.reconfigure", () => {
  test("should replace every setting and keep the id and project", () => {
    // Setup
    const config = SlackProjectChatConfig.create(settings());
    const before = config.toJSON();

    // Action
    config.reconfigure({
      integrationId: "integration-2",
      isAccessRequestNotificationEnabled: false,
      accessRequestChannels: "C9",
      isSecretRequestNotificationEnabled: false,
      isSecretSyncErrorNotificationEnabled: false
    });

    // Assert
    expect(config.toJSON()).toEqual({
      id: before.id,
      projectId: "project-1",
      integrationId: "integration-2",
      isAccessRequestNotificationEnabled: false,
      accessRequestChannels: "C9",
      isSecretRequestNotificationEnabled: false,
      secretRequestChannels: "",
      isSecretSyncErrorNotificationEnabled: false,
      secretSyncErrorChannels: ""
    });
  });

  test("should refuse too many channels and change nothing", () => {
    // Setup
    const config = SlackProjectChatConfig.create(settings());
    const before = config.toJSON();
    const tooMany = Array.from({ length: 21 }, (_, i) => `C${i}`).join(",");

    // Action
    const reconfigure = () =>
      config.reconfigure(settings({ integrationId: "integration-2", accessRequestChannels: tooMany }));

    // Assert
    expect(reconfigure).toThrow("You can only select up to 20 slack channels");
    expect(config.toJSON()).toEqual(before);
  });
});

describe("SlackProjectChatConfig.channelsFor", () => {
  test.each([
    [SecretsChatEvent.AccessRequest, ["A1", "A2"]],
    [SecretsChatEvent.SecretChangeRequest, ["S1"]],
    [SecretsChatEvent.SecretSyncError, ["E1", "E2", "E3"]]
  ])("should return the channels of the %s event", (event, expected) => {
    // Setup
    const config = SlackProjectChatConfig.create(
      settings({
        accessRequestChannels: "A1,A2",
        secretRequestChannels: "S1",
        secretSyncErrorChannels: "E1, E2,E3"
      })
    );

    // Action
    const channels = config.channelsFor(event);

    // Assert
    expect(channels).toEqual(expected);
  });

  test.each([
    [SecretsChatEvent.AccessRequest, { isAccessRequestNotificationEnabled: false }],
    [SecretsChatEvent.SecretChangeRequest, { isSecretRequestNotificationEnabled: false }],
    [SecretsChatEvent.SecretSyncError, { isSecretSyncErrorNotificationEnabled: false }]
  ])("should return no channels for the %s event when it is switched off", (event, off) => {
    // Setup
    const config = SlackProjectChatConfig.create(settings(off));

    // Action
    const channels = config.channelsFor(event);

    // Assert
    expect(channels).toBeNull();
  });

  test("should return no channels for an enabled event that has none", () => {
    // Setup
    const config = SlackProjectChatConfig.create(settings({ secretSyncErrorChannels: "" }));

    // Action
    const channels = config.channelsFor(SecretsChatEvent.SecretSyncError);

    // Assert
    expect(channels).toBeNull();
  });

  test("should skip empty entries a stored list holds", () => {
    // Setup
    const config = SlackProjectChatConfig.create(settings({ accessRequestChannels: "C1,,C2" }));

    // Action
    const channels = config.channelsFor(SecretsChatEvent.AccessRequest);

    // Assert
    expect(channels).toEqual(["C1", "C2"]);
  });
});
