import { SlackAppCredentials } from "./slack-app-credentials";

describe("SlackAppCredentials.orEnv", () => {
  test("should fall back to the env for each value the instance has not stored", () => {
    // Setup
    const stored = SlackAppCredentials.restore({ clientId: "stored-id", clientSecret: "" });

    // Action
    const result = stored.orEnv({ clientId: "env-id", clientSecret: "env-secret" });

    // Assert
    expect(result.toJSON()).toEqual({ clientId: "stored-id", clientSecret: "env-secret" });
  });

  test("should read an empty value when neither the instance nor the env has one", () => {
    // Setup
    const stored = SlackAppCredentials.restore({ clientId: "", clientSecret: "" });

    // Action
    const result = stored.orEnv({});

    // Assert
    expect(result.toJSON()).toEqual({ clientId: "", clientSecret: "" });
  });

  test("should keep the stored values over the env's", () => {
    // Setup
    const stored = SlackAppCredentials.restore({ clientId: "a", clientSecret: "b" });

    // Action
    const result = stored.orEnv({ clientId: "env-id", clientSecret: "env-secret" });

    // Assert
    expect(result.toJSON()).toEqual({ clientId: "a", clientSecret: "b" });
  });
});
