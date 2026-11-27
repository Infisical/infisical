import { RuleViolationError } from "@app/domains/lib/errors";

import { MicrosoftTeamsProjectChatConfig } from "./microsoft-teams-project-chat-config";
import { SecretsChatEvent } from "./secrets-chat-event";

const channels = (ids: string[], teamId = "team-1") => ({ teamId, channelIds: ids });

const settings = (overrides: Partial<Parameters<typeof MicrosoftTeamsProjectChatConfig.create>[0]> = {}) => ({
  projectId: "project-1",
  integrationId: "integration-1",
  isAccessRequestNotificationEnabled: true,
  accessRequestChannels: channels(["a1"]),
  isSecretRequestNotificationEnabled: true,
  secretRequestChannels: channels(["s1", "s2"], "team-2"),
  ...overrides
});

describe("MicrosoftTeamsProjectChatConfig.create", () => {
  test("should refuse enabled access request notifications without channels", () => {
    // Setup
    const input = settings({ accessRequestChannels: undefined });

    // Action
    const create = () => MicrosoftTeamsProjectChatConfig.create(input);

    // Assert
    expect(create).toThrow(RuleViolationError);
    expect(create).toThrow("Access request channels are required when access request notifications are enabled");
  });

  test("should refuse enabled secret request notifications without channels", () => {
    // Setup
    const input = settings({ secretRequestChannels: undefined });

    // Action
    const create = () => MicrosoftTeamsProjectChatConfig.create(input);

    // Assert
    expect(create).toThrow("Secret request channels are required when secret request notifications are enabled");
  });

  test("should refuse a config with no channels at all", () => {
    // Setup
    const input = settings({
      isAccessRequestNotificationEnabled: false,
      accessRequestChannels: undefined,
      isSecretRequestNotificationEnabled: false,
      secretRequestChannels: undefined
    });

    // Action
    const create = () => MicrosoftTeamsProjectChatConfig.create(input);

    // Assert
    expect(create).toThrow("At least one of access request channels or secret request channels is required");
  });

  test("should accept channels for a disabled event and leave the other event without channels", () => {
    // Setup
    const input = settings({ isSecretRequestNotificationEnabled: false, secretRequestChannels: undefined });

    // Action
    const config = MicrosoftTeamsProjectChatConfig.create(input);

    // Assert
    expect(config.toJSON().secretRequestChannels).toBeNull();
    expect(config.channelsFor(SecretsChatEvent.AccessRequest)).toEqual(channels(["a1"]));
  });

  test("should refuse more than 20 channels for an event", () => {
    // Setup
    const ids = Array.from({ length: 21 }, (_, i) => `c${i}`);

    // Action
    const create = () => MicrosoftTeamsProjectChatConfig.create(settings({ accessRequestChannels: channels(ids) }));

    // Assert
    expect(create).toThrow("You can only select up to 20 Microsoft Teams channels");
  });

  test("should refuse an empty channel list", () => {
    // Setup
    const input = settings({ accessRequestChannels: channels([]) });

    // Action
    const create = () => MicrosoftTeamsProjectChatConfig.create(input);

    // Assert
    expect(create).toThrow(RuleViolationError);
  });
});

describe("MicrosoftTeamsProjectChatConfig.reconfigure", () => {
  test("should replace every setting and keep the id", () => {
    // Setup
    const config = MicrosoftTeamsProjectChatConfig.create(settings());
    const before = config.toJSON();

    // Action
    config.reconfigure({
      integrationId: "integration-2",
      isAccessRequestNotificationEnabled: false,
      isSecretRequestNotificationEnabled: true,
      secretRequestChannels: channels(["s9"], "team-9")
    });

    // Assert
    expect(config.toJSON()).toEqual({
      id: before.id,
      projectId: "project-1",
      integrationId: "integration-2",
      isAccessRequestNotificationEnabled: false,
      accessRequestChannels: null,
      isSecretRequestNotificationEnabled: true,
      secretRequestChannels: channels(["s9"], "team-9")
    });
  });

  test("should refuse a config without channels and change nothing", () => {
    // Setup
    const config = MicrosoftTeamsProjectChatConfig.create(settings());
    const before = config.toJSON();

    // Action
    const reconfigure = () =>
      config.reconfigure({
        integrationId: "integration-2",
        isAccessRequestNotificationEnabled: false,
        isSecretRequestNotificationEnabled: false
      });

    // Assert
    expect(reconfigure).toThrow("At least one of access request channels or secret request channels is required");
    expect(config.toJSON()).toEqual(before);
  });
});

describe("MicrosoftTeamsProjectChatConfig.channelsFor", () => {
  test("should return the team and channels of the access request and secret change request events", () => {
    // Setup
    const config = MicrosoftTeamsProjectChatConfig.create(settings());

    // Action
    const access = config.channelsFor(SecretsChatEvent.AccessRequest);
    const change = config.channelsFor(SecretsChatEvent.SecretChangeRequest);

    // Assert
    expect(access).toEqual(channels(["a1"]));
    expect(change).toEqual(channels(["s1", "s2"], "team-2"));
  });

  test("should have no channels for secret sync errors", () => {
    // Setup
    const config = MicrosoftTeamsProjectChatConfig.create(settings());

    // Action
    const sync = config.channelsFor(SecretsChatEvent.SecretSyncError);

    // Assert
    expect(sync).toBeNull();
  });

  test("should return no channels for an event that is switched off", () => {
    // Setup
    const config = MicrosoftTeamsProjectChatConfig.create(settings({ isAccessRequestNotificationEnabled: false }));

    // Action
    const access = config.channelsFor(SecretsChatEvent.AccessRequest);

    // Assert
    expect(access).toBeNull();
  });

  test("should return no channels when a stored config holds an empty channel list", () => {
    // Setup
    const config = MicrosoftTeamsProjectChatConfig.restore({
      ...MicrosoftTeamsProjectChatConfig.create(settings()).toJSON(),
      accessRequestChannels: { teamId: "team-1", channelIds: [] }
    });

    // Action
    const access = config.channelsFor(SecretsChatEvent.AccessRequest);

    // Assert
    expect(access).toBeNull();
  });
});
