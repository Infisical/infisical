import opentelemetry from "@opentelemetry/api";

const infisicalMeter = opentelemetry.metrics.getMeter("Infisical");

export enum AuthAttemptAuthMethod {
  EMAIL = "email",
  SAML = "saml",
  OIDC = "oidc",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab"
}

export enum AuthAttemptAuthResult {
  SUCCESS = "success",
  FAILURE = "failure"
}

export const authAttemptCounter = infisicalMeter.createCounter("infisical.auth.attempt.count", {
  description: "Authentication attempts (both successful and failed)",
  unit: "{attempt}"
});
