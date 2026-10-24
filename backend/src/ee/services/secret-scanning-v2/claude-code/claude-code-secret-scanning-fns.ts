import { crypto } from "@app/lib/crypto";

// The Claude Code plugin computes the same value locally, so both sides must hash the same input. Only the secret is
// hashed: a secret that several rules match is one finding, and a review of it covers every rule.
export const getClaudeCodeFindingFingerprint = (secret: string) =>
  crypto.nativeCrypto.createHash("sha256").update(secret).digest("hex");
