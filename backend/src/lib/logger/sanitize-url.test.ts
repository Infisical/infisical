import { sanitizeUrlForLog } from "./sanitize-url";

describe("sanitizeUrlForLog", () => {
  test.each([
    "https://hooks.slack.com/services/T0000000/B0000000/aBcDeFgHiJkLmNoPqRsTuVwX",
    "https://discord.com/api/webhooks/1234567890/tokentokentokentoken",
    "https://outlook.webhook.office.com/webhookb2/abc-def@ghi/IncomingWebhook/jkl/mno",
    "https://api.telegram.org/bot123456:AAHrandomsecret/sendMessage"
  ])("drops the path of %s", (url) => {
    const sanitized = sanitizeUrlForLog(url);
    expect(sanitized).toMatch(/\/\[REDACTED\]$/);
  });

  test("drops the path on unknown hosts even when it looks harmless", () => {
    expect(sanitizeUrlForLog("https://api.example.com/v1/secrets/my-app")).toBe("https://api.example.com/[REDACTED]");
    expect(sanitizeUrlForLog("https://example.com/hook/abcdefghijklmnopqrstuv")).toBe("https://example.com/[REDACTED]");
  });

  test("keeps query param names but redacts their values", () => {
    expect(sanitizeUrlForLog("https://api.example.com/v1/items?page=2&token=supersecret")).toBe(
      "https://api.example.com/[REDACTED]?page=[REDACTED]&token=[REDACTED]"
    );
  });

  test("keeps a root path as is", () => {
    expect(sanitizeUrlForLog("https://api.example.com")).toBe("https://api.example.com/");
    expect(sanitizeUrlForLog("https://api.example.com/")).toBe("https://api.example.com/");
  });

  test("strips embedded credentials and the fragment", () => {
    expect(sanitizeUrlForLog("https://user:pass@api.example.com/path#frag")).toBe("https://api.example.com/[REDACTED]");
  });

  test("resolves a relative url against the axios baseURL", () => {
    expect(sanitizeUrlForLog("/v1/items", "https://api.example.com/base")).toBe("https://api.example.com/[REDACTED]");
  });

  test("keeps the origin of an absolute url even when a baseURL is set", () => {
    expect(sanitizeUrlForLog("https://other.example.com/x", "https://api.example.com")).toBe(
      "https://other.example.com/[REDACTED]"
    );
  });

  test("redacts the path of a relative url with no base", () => {
    expect(sanitizeUrlForLog("/v1/items")).toBe("/[REDACTED]");
  });

  test("returns a placeholder instead of echoing an unparseable url", () => {
    expect(sanitizeUrlForLog("https://")).toBe("[REDACTED]");
  });

  test("handles a missing url", () => {
    expect(sanitizeUrlForLog(undefined)).toBe("NO_URL");
    expect(sanitizeUrlForLog("")).toBe("NO_URL");
  });
});
