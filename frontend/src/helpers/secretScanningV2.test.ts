import { describe, expect, test } from "vitest";

import { formatSecretScanningRule } from "./secretScanningV2";

describe("formatSecretScanningRule", () => {
  test.each([
    ["generic-password", "Generic Password"],
    ["generic-api-key", "Generic API Key"],
    ["stripe-access-token", "Stripe Access Token"],
    ["private-key", "Private Key"],
    ["mongodb-connection-string", "MongoDB Connection String"],
    ["generic-credential-uri", "Generic Credential URI"],
    ["pkcs12-file", "PKCS#12 File"],
    ["github-pat", "GitHub Personal Access Token"],
    ["github-fine-grained-pat", "GitHub Fine-Grained Personal Access Token"],
    ["gitlab-ptt", "GitLab Pipeline Trigger Token"],
    ["curl-auth-header", "cURL Auth Header"],
    ["jwt", "JWT"],
    ["jwt-base64", "JWT Base64"],
    ["posthog-project-api-key", "PostHog Project API Key"],
    ["slack-webhook-url", "Slack Webhook URL"],
    ["hashicorp-tf-api-token", "HashiCorp Terraform API Token"],
    ["aws-access-token", "AWS Access Token"],
    ["1password-secret-key", "1Password Secret Key"],
    ["npm-access-token", "npm Access Token"],
    ["internal_service_token", "Internal Service Token"],
    ["MyCompany-key", "MyCompany Key"]
  ])("%s", (rule, expected) => {
    expect(formatSecretScanningRule(rule)).toBe(expected);
  });
});
