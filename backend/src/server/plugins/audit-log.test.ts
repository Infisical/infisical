import { describe, expect, test } from "vitest";

import { UserAgentType } from "@app/ee/services/audit-log/audit-log-types";

import { getUserAgentType } from "./audit-log";

// Keep this table in sync with the Go mirror in
// backend-go/internal/services/auditlog/useragent_test.go so drift between the
// two classifiers shows up as a failing test on either side.
const cases: [userAgent: string, expected: UserAgentType][] = [
  ["", UserAgentType.OTHER],
  ["cli", UserAgentType.CLI],
  ["k8-operator", UserAgentType.K8_OPERATOR],
  ["k8-operator/0.11.4", UserAgentType.K8_OPERATOR],
  ["terraform", UserAgentType.TERRAFORM],
  ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", UserAgentType.WEB],
  ["InfisicalNodeSDK/2.3.4", UserAgentType.NODE_SDK],
  ["InfisicalPythonSDK/1.8.0", UserAgentType.PYTHON_SDK],
  ["infisical-agent", UserAgentType.AGENT],
  ["infisical-agent/1.2.3", UserAgentType.AGENT],
  ["k8-external-secrets-operator", UserAgentType.K8_EXTERNAL_SECRETS_OPERATOR],
  ["k8-external-secrets-operator/0.9.5", UserAgentType.K8_EXTERNAL_SECRETS_OPERATOR],
  ["infisical-go-sdk", UserAgentType.GO_SDK],
  ["infisical-go-sdk/v0.4.0", UserAgentType.GO_SDK],
  ["infisical-ruby-sdk", UserAgentType.RUBY_SDK],
  ["infisical-ruby-sdk/v1.0.3", UserAgentType.RUBY_SDK],
  ["Infisical.Sdk", UserAgentType.DOTNET_SDK],
  ["Infisical.Sdk/2.3.6", UserAgentType.DOTNET_SDK],
  ["infisical-rs", UserAgentType.RUST_SDK],
  ["infisical-rs/0.1.0", UserAgentType.RUST_SDK],
  ["infisical-cpp-sdk", UserAgentType.CPP_SDK],
  ["infisical-cpp-sdk/1.0.0", UserAgentType.CPP_SDK],
  ["infisical-python-sdk", UserAgentType.PYTHON_SDK],
  ["infisical-python-sdk/2.0.1", UserAgentType.PYTHON_SDK],
  ["infisical-nodejs-sdk", UserAgentType.NODE_SDK],
  ["infisical-nodejs-sdk/3.0.0", UserAgentType.NODE_SDK],
  ["curl/8.4.0", UserAgentType.OTHER],
  ["python-requests/2.31.0", UserAgentType.OTHER],
  ["infisical-agentx", UserAgentType.OTHER]
];

describe("getUserAgentType", () => {
  test("a missing user agent maps to other", () => {
    expect(getUserAgentType(undefined)).toBe(UserAgentType.OTHER);
  });

  test.each(cases)("%j maps to %j", (userAgent, expected) => {
    expect(getUserAgentType(userAgent)).toBe(expected);
  });
});
