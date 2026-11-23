import { AGENT_VAULT_MAX_SESSION_SKILLS } from "@app/ee/routes/v1/agent-vault-routers/agent-vault-schemas";
import { AGENT_VAULT_MAX_SESSION_INLINE_SKILLS } from "@app/ee/services/agent-vault-session/agent-vault-session-inline-skill-fns";
import { getAgentVaultBuiltinSkill } from "@app/ee/services/agent-vault-skill/agent-vault-builtin-skill";
import {
  AGENT_VAULT_MAX_SKILLS_PER_BUNDLE,
  AGENT_VAULT_SKILL_MAX_FILES,
  AGENT_VAULT_SKILL_MAX_PATH_LENGTH,
  AGENT_VAULT_SKILL_MAX_TOTAL_BYTES,
  AGENT_VAULT_SKILL_NAME_MAX_LENGTH,
  AGENT_VAULT_SKILL_UPLOAD_BODY_LIMIT
} from "@app/ee/services/agent-vault-skill/agent-vault-skill-fns";

// Released CLIs, as agent-vault run and as the proxy that passes the response on, read at most this much of it.
const RELEASED_CLI_READ_LIMIT = 64 * 1024 * 1024;

const UUID = "00000000-0000-4000-8000-000000000000";
const base64Length = (bytes: number) => 4 * Math.ceil(bytes / 3);
const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

// A delivered library skill at the limits: the most files, each path as long as allowed and written in three-byte
// characters, sharing the most bytes a skill may hold. Each file's base64 is padded on its own, so more files cost more.
const worstLibrarySkillBytes = () => {
  const skeleton = jsonBytes({
    id: UUID,
    name: "n".repeat(AGENT_VAULT_SKILL_NAME_MAX_LENGTH),
    version: Number.MAX_SAFE_INTEGER,
    sha256: "f".repeat(64),
    files: Array.from({ length: AGENT_VAULT_SKILL_MAX_FILES }, () => ({
      path: "€".repeat(AGENT_VAULT_SKILL_MAX_PATH_LENGTH),
      mode: "0644",
      contentBase64: ""
    })),
    isBuiltin: false
  });
  const bytesPerFile = Math.ceil(AGENT_VAULT_SKILL_MAX_TOTAL_BYTES / AGENT_VAULT_SKILL_MAX_FILES);
  return skeleton + AGENT_VAULT_SKILL_MAX_FILES * base64Length(bytesPerFile);
};

describe("a session's skills response at the limits", () => {
  test("stays under what a released CLI reads", async () => {
    const librarySkills = AGENT_VAULT_MAX_SKILLS_PER_BUNDLE + AGENT_VAULT_MAX_SESSION_SKILLS;
    // Skills sent with a session come back as they were sent, inside the one request that carried them all, plus the
    // fields the response adds to each.
    const sentSkills =
      AGENT_VAULT_SKILL_UPLOAD_BODY_LIMIT +
      AGENT_VAULT_MAX_SESSION_INLINE_SKILLS *
        jsonBytes({ id: UUID, version: Number.MAX_SAFE_INTEGER, sha256: "f".repeat(64), isBuiltin: false });
    const builtin = jsonBytes({ ...(await getAgentVaultBuiltinSkill()), isBuiltin: true });
    const entries = librarySkills + AGENT_VAULT_MAX_SESSION_INLINE_SKILLS + 1;

    const worstCase =
      jsonBytes({ skills: [] }) + librarySkills * worstLibrarySkillBytes() + sentSkills + builtin + (entries - 1);

    expect(worstCase).toBeLessThan(RELEASED_CLI_READ_LIMIT);
  });
});
