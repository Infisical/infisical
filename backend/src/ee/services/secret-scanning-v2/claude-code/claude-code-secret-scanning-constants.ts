import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TSecretScanningDataSourceListItem } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";

export const CLAUDE_CODE_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION: TSecretScanningDataSourceListItem = {
  name: "Claude Code",
  type: SecretScanningDataSource.ClaudeCode,
  connection: null
};

// Large enough for prompts with pasted files, small enough to keep the queued job payload bounded.
export const CLAUDE_CODE_MAX_PROMPT_LENGTH = 1_000_000;

export const CLAUDE_CODE_MAX_FINGERPRINTS = 100;
