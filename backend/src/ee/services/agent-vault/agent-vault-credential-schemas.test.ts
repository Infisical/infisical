import { AgentVaultBearerConfigSchema } from "./agent-vault-credential-schemas";

describe("bearer credential config", () => {
  test("Authorization and Bearer settle together when neither is given", () => {
    expect(AgentVaultBearerConfigSchema.parse({})).toEqual({
      headerName: "Authorization",
      headerPrefix: "Bearer"
    });
  });

  test("naming Authorization outright still gets the scheme it belongs to", () => {
    expect(AgentVaultBearerConfigSchema.parse({ headerName: "authorization" })).toEqual({
      headerName: "authorization",
      headerPrefix: "Bearer"
    });
  });

  // The scheme is RFC 6750's for Authorization. A key in its own header is not a bearer token in that
  // sense, and an API given "Bearer abc" where it wanted "abc" rejects the request.
  test("a header of the caller's own gets no scheme they did not ask for", () => {
    expect(AgentVaultBearerConfigSchema.parse({ headerName: "X-Api-Key" })).toEqual({
      headerName: "X-Api-Key",
      headerPrefix: ""
    });
  });

  test("an explicit prefix is kept, on any header", () => {
    expect(AgentVaultBearerConfigSchema.parse({ headerName: "X-Api-Key", headerPrefix: "Token" })).toEqual({
      headerName: "X-Api-Key",
      headerPrefix: "Token"
    });
    expect(AgentVaultBearerConfigSchema.parse({ headerPrefix: "" })).toEqual({
      headerName: "Authorization",
      headerPrefix: ""
    });
  });
});
