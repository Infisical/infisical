export const MAX_PREVENT_DUPLICATE_SECRET_VALUE_VERSIONS = 25;

export const MAX_SECRET_CONSTRAINT_LENGTH = 65536;

export const MAX_GENERATED_CONSTRAINT_LENGTH = 2048;

export const MAX_CONSTRAINT_PATTERN_LENGTH = 4096;
export const MAX_CONSTRAINT_AFFIX_LENGTH = 1024;

// a bulk write or a folder move can fail on every secret it carries, so the error describes only the first few
export const MAX_DESCRIBED_FAILING_SECRETS = 5;
