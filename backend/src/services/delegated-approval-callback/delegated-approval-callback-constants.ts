export const DELEGATED_APPROVAL_CALLBACK_PATH = "/api/v1/delegated-approvals/callback";

export const DELEGATED_APPROVAL_CALLBACK_TOKEN_BYTES = 32;

export const DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX = "inf_ext_";

// Lowercase on purpose: Node lowercases incoming header names, and Fastify compiles a Zod headers
// schema as-is, so the key has to match what arrives.
export const DELEGATED_APPROVAL_CALLBACK_TOKEN_HEADER = "infisical-approval-token";

export const DELEGATED_APPROVAL_CALLBACK_TOKEN_MAX_LENGTH = 256;

export const DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS = 5;

// Longer than the outbox keeps retrying one read-back, which ends about an hour after its first attempt.
export const DELEGATED_APPROVAL_DECISION_READ_CLAIM_TTL_MS = 70 * 60_000;

export const DELEGATED_APPROVAL_CALLBACK_REJECTED_MESSAGE = "Callback rejected.";

export const DELEGATED_APPROVAL_CALLBACK_ATTEMPTS_EXHAUSTED_REASON = `The delegated approval system asked Infisical to check for its decision more than ${DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS} times, so Infisical no longer accepts a decision for this request. Create the request again.`;
