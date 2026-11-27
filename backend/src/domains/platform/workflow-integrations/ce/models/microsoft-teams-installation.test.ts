import { MicrosoftTeamsInstallation, MicrosoftTeamsTokenKind } from "./microsoft-teams-installation";

const MINUTE = 60 * 1000;
const NOW = new Date("2026-03-01T12:00:00.000Z");
const after = (ms: number) => new Date(NOW.getTime() + ms);

describe("MicrosoftTeamsInstallation.cachedToken", () => {
  test("should return the token when it expires more than five minutes after now", () => {
    // Setup
    const token = Buffer.from("cipher");
    const installation = MicrosoftTeamsInstallation.forTenant("t1").withToken(
      MicrosoftTeamsTokenKind.Graph,
      token,
      after(5 * MINUTE + 1)
    );

    // Action
    const cached = installation.cachedToken(MicrosoftTeamsTokenKind.Graph, NOW);

    // Assert
    expect(cached).toEqual(token);
  });

  test.each([5 * MINUTE, 4 * MINUTE, 0, -MINUTE])("should return null when the token expires %i ms after now", (ms) => {
    // Setup
    const installation = MicrosoftTeamsInstallation.forTenant("t1").withToken(
      MicrosoftTeamsTokenKind.Graph,
      Buffer.from("cipher"),
      after(ms)
    );

    // Action
    const cached = installation.cachedToken(MicrosoftTeamsTokenKind.Graph, NOW);

    // Assert
    expect(cached).toBeNull();
  });

  test("should return null when no token was stored", () => {
    // Setup
    const installation = MicrosoftTeamsInstallation.forTenant("t1");

    // Action
    const graph = installation.cachedToken(MicrosoftTeamsTokenKind.Graph, NOW);
    const bot = installation.cachedToken(MicrosoftTeamsTokenKind.BotFramework, NOW);

    // Assert
    expect([graph, bot]).toEqual([null, null]);
  });

  test("should keep the graph and bot framework tokens independent", () => {
    // Setup
    const botToken = Buffer.from("bot-cipher");
    const installation = MicrosoftTeamsInstallation.forTenant("t1")
      .withToken(MicrosoftTeamsTokenKind.BotFramework, botToken, after(30 * MINUTE))
      .withToken(MicrosoftTeamsTokenKind.Graph, Buffer.from("graph-cipher"), after(MINUTE));

    // Action
    const bot = installation.cachedToken(MicrosoftTeamsTokenKind.BotFramework, NOW);
    const graph = installation.cachedToken(MicrosoftTeamsTokenKind.Graph, NOW);

    // Assert
    expect(bot).toEqual(botToken);
    expect(graph).toBeNull();
  });
});

describe("MicrosoftTeamsInstallation.withToken / withInternalAppId", () => {
  test("should return a new installation and leave the original unchanged", () => {
    // Setup
    const original = MicrosoftTeamsInstallation.forTenant("t1");
    const before = original.toJSON();

    // Action
    const withToken = original.withToken(MicrosoftTeamsTokenKind.Graph, Buffer.from("c"), after(30 * MINUTE));
    const withApp = original.withInternalAppId("app-1");

    // Assert
    expect(original.toJSON()).toEqual(before);
    expect(withToken).not.toBe(original);
    expect(withApp.internalTeamsAppId).toBe("app-1");
  });

  test("should keep the other token and the tenant when one token is replaced", () => {
    // Setup
    const graph = Buffer.from("graph-cipher");
    const installation = MicrosoftTeamsInstallation.forTenant("t1").withToken(
      MicrosoftTeamsTokenKind.Graph,
      graph,
      after(30 * MINUTE)
    );

    // Action
    const replaced = installation.withToken(
      MicrosoftTeamsTokenKind.BotFramework,
      Buffer.from("bot"),
      after(30 * MINUTE)
    );

    // Assert
    expect(replaced.tenantId).toBe("t1");
    expect(replaced.cachedToken(MicrosoftTeamsTokenKind.Graph, NOW)).toEqual(graph);
  });
});
