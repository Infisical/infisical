import { MicrosoftTeamsAppCredentials } from "./microsoft-teams-app-credentials";

describe("MicrosoftTeamsAppCredentials.isComplete", () => {
  test("should be complete with all three values", () => {
    // Setup
    const credentials = MicrosoftTeamsAppCredentials.restore({ appId: "a", clientSecret: "b", botId: "c" });

    // Action
    const complete = credentials.isComplete();

    // Assert
    expect(complete).toBe(true);
  });

  test.each([
    ["appId", { appId: "", clientSecret: "b", botId: "c" }],
    ["clientSecret", { appId: "a", clientSecret: "", botId: "c" }],
    ["botId", { appId: "a", clientSecret: "b", botId: "" }]
  ])("should not be complete without the %s", (_name, record) => {
    // Setup
    const credentials = MicrosoftTeamsAppCredentials.restore(record);

    // Action
    const complete = credentials.isComplete();

    // Assert
    expect(complete).toBe(false);
  });
});
