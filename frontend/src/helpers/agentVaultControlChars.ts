// Mirrors AGENT_VAULT_NO_CONTROL_CHARS_RE on the backend.
// eslint-disable-next-line no-control-regex
export const AGENT_VAULT_NO_CONTROL_CHARS_RE = /^[^\x00-\x1f\x7f]*$/;

export const AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE =
  "This can't contain line breaks or other control characters. Check for a stray newline if you pasted it.";
