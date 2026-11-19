import { describe, expect, it } from "vitest";

import { CoolifyConnectionApiTokenCredentialsSchema } from "./coolify-connection-schemas";

const isValidInstanceUrl = (instanceUrl?: string) =>
  CoolifyConnectionApiTokenCredentialsSchema.safeParse({ instanceUrl, apiToken: "1|token" }).success;

describe("Coolify connection instance URL", () => {
  it.each(["https://app.coolify.io", "https://coolify.example.com/", "http://10.0.0.5:8000"])("accepts %s", (url) => {
    expect(isValidInstanceUrl(url)).toBe(true);
  });

  it.each([
    "https://user:token@coolify.example.com",
    "https://coolify.example.com/?a=b",
    "https://coolify.example.com/#fragment",
    "ftp://coolify.example.com",
    "coolify.example.com",
    "",
    undefined
  ])("rejects %s", (url) => {
    expect(isValidInstanceUrl(url)).toBe(false);
  });
});
