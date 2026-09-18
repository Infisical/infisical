import RE2 from "re2";

export const pagerDutyIntegrationKeyRegex = new RE2("^[a-f0-9]{32}$", "i");

export const PAGERDUTY_INTEGRATION_KEY_ERROR = "Integration key must be a 32-character hex string";
