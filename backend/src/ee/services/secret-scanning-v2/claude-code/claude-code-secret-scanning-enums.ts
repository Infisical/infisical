export enum ClaudeCodeSecretDetectedAction {
  // the prompt is held back until every secret in it is reviewed
  Block = "block",
  // the prompt goes through; the secret is only recorded as a finding
  Report = "report"
}

// What Infisical knows about a secret the plugin found in a prompt.
export enum ClaudeCodeSecretStatus {
  // a finding for the secret has a status that lets prompts use it
  Allowed = "allowed",
  // a finding for the secret exists, but it hasn't been reviewed to a status that lets prompts use it
  PendingResolution = "pending-resolution",
  // no finding exists for the secret yet
  NewFinding = "new-finding"
}
