import { describe, expect, it } from "vitest";

import { AgentVaultOAuthCallbackQueryParamsSchema } from "./callbackSchema";

describe("OAuth callback input", () => {
  it("keeps the UUID state and bounded values from a valid provider redirect", () => {
    const params = {
      state: "11111111-1111-4111-8111-111111111111.random-state",
      code: "code",
      iss: "https://provider.example.com"
    };
    expect(AgentVaultOAuthCallbackQueryParamsSchema.parse(params)).toEqual(params);
  });

  it.each([
    "../../projects.state",
    "../access-bundles?x=1.state",
    "not-a-uuid.state",
    "",
    "x".repeat(257)
  ])("drops a state that could select another API path: %s", (state) => {
    expect(AgentVaultOAuthCallbackQueryParamsSchema.parse({ state }).state).toBeUndefined();
  });

  it("drops provider fields exceeding the API's bounds", () => {
    const parsed = AgentVaultOAuthCallbackQueryParamsSchema.parse({
      code: "x".repeat(4097),
      iss: "x".repeat(2049),
      error: "x".repeat(1025),
      error_description: "x".repeat(4097)
    });
    expect(Object.values(parsed).every((value) => value === undefined)).toBe(true);
  });
});
