export enum ClaudeCodeSecretDetectedAction {
  // the prompt is held back until every secret in it is reviewed
  Block = "block",
  // the prompt goes through; the secret is only recorded as a finding
  Report = "report"
}
