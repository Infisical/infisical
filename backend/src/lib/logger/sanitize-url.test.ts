import { sanitizeUrlForLog } from "./sanitize-url";

describe("sanitizeUrlForLog", () => {
  test("drops the path of an incoming-webhook provider", () => {
    expect(sanitizeUrlForLog("https://hooks.slack.com/services/T0000000/B0000000/aBcDeFgHiJkLmNoPqRsTuVwX")).toBe(
      "https://hooks.slack.com/[REDACTED]"
    );
  });

  test.each([
    "https://discord.com/api/webhooks/1234567890/tokentokentokentoken",
    "https://outlook.webhook.office.com/webhookb2/abc-def@ghi/IncomingWebhook/jkl/mno",
    "https://api.telegram.org/bot123456:AAHrandomsecret/sendMessage"
  ])("drops the path of %s", (url) => {
    const sanitized = sanitizeUrlForLog(url);
    expect(sanitized).toMatch(/\/\[REDACTED\]$/);
  });

  test("keeps query param names but redacts their values", () => {
    expect(sanitizeUrlForLog("https://api.example.com/v1/items?page=2&token=supersecret")).toBe(
      "https://api.example.com/v1/items?page=[REDACTED]&token=[REDACTED]"
    );
  });

  test("keeps readable paths on unknown hosts", () => {
    expect(sanitizeUrlForLog("https://api.example.com/v1/secrets/my-app")).toBe(
      "https://api.example.com/v1/secrets/my-app"
    );
  });

  test("redacts token-shaped path segments on unknown hosts", () => {
    expect(sanitizeUrlForLog("https://webhooks.acme.internal/hook/9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c")).toBe(
      "https://webhooks.acme.internal/hook/[REDACTED]"
    );
  });

  test("strips embedded credentials and the fragment", () => {
    expect(sanitizeUrlForLog("https://user:pass@api.example.com/path#frag")).toBe("https://api.example.com/path");
  });

  test("resolves a relative url against the axios baseURL", () => {
    expect(sanitizeUrlForLog("/v1/items", "https://api.example.com/base")).toBe(
      "https://api.example.com/base/v1/items"
    );
  });

  test("keeps an absolute url even when a baseURL is set", () => {
    expect(sanitizeUrlForLog("https://other.example.com/x", "https://api.example.com")).toBe(
      "https://other.example.com/x"
    );
  });

  test("returns a placeholder instead of echoing an unparseable url", () => {
    expect(sanitizeUrlForLog("https://")).toBe("[REDACTED]");
  });

  test("handles a missing url", () => {
    expect(sanitizeUrlForLog(undefined)).toBe("NO_URL");
    expect(sanitizeUrlForLog("")).toBe("NO_URL");
  });
});
