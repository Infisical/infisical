import { describe, expect, it } from "vitest";

import { JenkinsConnectionApiTokenCredentialsSchema } from "./jenkins-connection-schemas";

const isValidInstanceUrl = (instanceUrl: string) =>
  JenkinsConnectionApiTokenCredentialsSchema.safeParse({ instanceUrl, username: "infisical", apiToken: "token" })
    .success;

describe("Jenkins connection instance URL", () => {
  it.each(["https://ci.example.com", "https://ci.example.com/jenkins/", "http://10.0.0.5:8080"])(
    "accepts %s",
    (url) => {
      expect(isValidInstanceUrl(url)).toBe(true);
    }
  );

  it.each([
    "https://svc:token@ci.example.com/jenkins",
    "https://svc@ci.example.com",
    "https://ci.example.com/?a=b",
    "https://ci.example.com/#fragment",
    "ftp://ci.example.com",
    "ci.example.com"
  ])("rejects %s", (url) => {
    expect(isValidInstanceUrl(url)).toBe(false);
  });
});
