import { JSON_SCHEMA, load } from "js-yaml";

import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { slugSchema } from "@app/server/lib/schemas";

import { AgentVaultSkillFileMode, TAgentVaultSkillFile } from "./agent-vault-skill-types";

export const AGENT_VAULT_SKILL_MANIFEST = "SKILL.md";
export const AGENT_VAULT_SKILL_MAX_FILES = 50;
export const AGENT_VAULT_SKILL_MAX_FILE_BYTES = 256 * 1024;
export const AGENT_VAULT_SKILL_MAX_TOTAL_BYTES = 1024 * 1024;
export const AGENT_VAULT_SKILL_MAX_HEADER_BYTES = 4 * 1024;
export const AGENT_VAULT_SKILL_MAX_PATH_LENGTH = 255;
// Most file systems cap one file or folder name at 255 bytes, not characters.
export const AGENT_VAULT_SKILL_MAX_PATH_SEGMENT_BYTES = 255;
export const AGENT_VAULT_SKILL_NAME_MAX_LENGTH = 64;
export const AGENT_VAULT_SKILL_DESCRIPTION_MAX_LENGTH = 1024;
export const AGENT_VAULT_SKILL_VERSIONS_KEPT = 20;
export const AGENT_VAULT_MAX_SKILLS_PER_BUNDLE = 25;
export const AGENT_VAULT_MAX_SKILLS = 64;

// The schema caps content only at the body limit, so an oversize file in a request of up to about 1.5 MB of file
// content (base64 adds a third) gets the 400 that names it. A larger request gets "Request body is too large".
export const AGENT_VAULT_SKILL_UPLOAD_BODY_LIMIT = 2 * 1024 * 1024;

const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/;
// Characters Windows refuses in a file name, so a skill installs the same way on every platform.
const WINDOWS_INVALID_CHARS_RE = /[:<>"|?*]/;
const WINDOWS_DEVICE_NAME_RE = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

const SkillNameSchema = slugSchema({ max: AGENT_VAULT_SKILL_NAME_MAX_LENGTH, field: "Name", trim: false });

export type TValidatedSkill = {
  name: string;
  description: string;
  files: TAgentVaultSkillFile[];
  serialized: Buffer;
  sha256: string;
  sizeBytes: number;
  fileCount: number;
};

const assertValidPath = (path: string) => {
  if (!path.length) {
    throw new BadRequestError({ message: "A file has an empty path." });
  }
  if (!path.isWellFormed()) {
    throw new BadRequestError({ message: `File path ${JSON.stringify(path)} is not valid Unicode.` });
  }
  if (path.length > AGENT_VAULT_SKILL_MAX_PATH_LENGTH) {
    throw new BadRequestError({
      message: `File path '${path.slice(0, 64)}...' is longer than ${AGENT_VAULT_SKILL_MAX_PATH_LENGTH} characters.`
    });
  }
  if (CONTROL_CHARS_RE.test(path)) {
    throw new BadRequestError({ message: `File path ${JSON.stringify(path)} contains a control character.` });
  }
  if (path.includes("\\")) {
    throw new BadRequestError({ message: `File path '${path}' uses a backslash. Separate folders with '/'.` });
  }
  const segments = path.split("/");
  if (path.startsWith("/") || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new BadRequestError({
      message: `File path '${path}' must be a relative path inside the skill folder, with no empty, '.' or '..' parts.`
    });
  }
  const long = segments.find(
    (segment) => Buffer.byteLength(segment, "utf8") > AGENT_VAULT_SKILL_MAX_PATH_SEGMENT_BYTES
  );
  if (long !== undefined) {
    const shown = Array.from(long).slice(0, 64).join("");
    throw new BadRequestError({
      message: `File name '${shown}${shown.length < long.length ? "…" : ""}' in '${path}' is too long. Shorten it.`
    });
  }
  if (WINDOWS_INVALID_CHARS_RE.test(path)) {
    throw new BadRequestError({
      message: `File path '${path}' can't contain any of : < > " | ? *`
    });
  }
  const trailing = segments.find((segment) => segment.endsWith(".") || segment.endsWith(" "));
  if (trailing !== undefined) {
    throw new BadRequestError({
      message: `File path '${path}' has a part ending in a dot or a space ('${trailing}'), which isn't allowed.`
    });
  }
  const device = segments.find((segment) => WINDOWS_DEVICE_NAME_RE.test(segment));
  if (device !== undefined) {
    throw new BadRequestError({
      message: `File path '${path}' uses '${device}', which is a reserved name. Rename that file or folder.`
    });
  }
};

const decodeContent = (file: { path: string; contentBase64: string }) => {
  if (!BASE64_RE.test(file.contentBase64)) {
    throw new BadRequestError({ message: `File '${file.path}' is not valid base64.` });
  }
  return Buffer.from(file.contentBase64, "base64");
};

const extractHeader = (content: Buffer) => {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(content);
  } catch {
    throw new BadRequestError({ message: `${AGENT_VAULT_SKILL_MANIFEST} is not UTF-8 text.` });
  }

  const lines = text.split(/\r?\n/);
  const closing = lines[0]?.trimEnd() === "---" ? lines.findIndex((line, i) => i > 0 && line.trimEnd() === "---") : -1;
  if (closing === -1) {
    throw new BadRequestError({
      message: `${AGENT_VAULT_SKILL_MANIFEST} must start with a YAML header between two '---' lines.`
    });
  }

  const header = lines.slice(1, closing).join("\n");
  if (Buffer.byteLength(header, "utf8") > AGENT_VAULT_SKILL_MAX_HEADER_BYTES) {
    throw new BadRequestError({
      message: `${AGENT_VAULT_SKILL_MANIFEST} header is larger than ${AGENT_VAULT_SKILL_MAX_HEADER_BYTES / 1024} KB.`
    });
  }
  return header;
};

export const parseSkillHeader = (content: Buffer): { name: string; description: string } => {
  const header = extractHeader(content);

  let parsed: unknown;
  try {
    parsed = load(header, { schema: JSON_SCHEMA });
  } catch {
    throw new BadRequestError({ message: `${AGENT_VAULT_SKILL_MANIFEST} header is not valid YAML.` });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BadRequestError({
      message: `${AGENT_VAULT_SKILL_MANIFEST} header must be a list of 'key: value' lines.`
    });
  }

  const { name, description } = parsed as Record<string, unknown>;

  if (name === undefined || name === null || name === "") {
    throw new BadRequestError({ message: `${AGENT_VAULT_SKILL_MANIFEST} header needs a 'name'.` });
  }
  if (typeof name !== "string") {
    throw new BadRequestError({
      message: `The 'name' in ${AGENT_VAULT_SKILL_MANIFEST} must be text. Put it in quotes.`
    });
  }
  if (name.length > AGENT_VAULT_SKILL_NAME_MAX_LENGTH) {
    throw new BadRequestError({
      message: `The 'name' in ${AGENT_VAULT_SKILL_MANIFEST} is longer than ${AGENT_VAULT_SKILL_NAME_MAX_LENGTH} characters.`
    });
  }
  if (!SkillNameSchema.safeParse(name).success) {
    throw new BadRequestError({
      message: `The 'name' in ${AGENT_VAULT_SKILL_MANIFEST} is '${name}'. A skill name can only use lowercase letters, numbers and single hyphens, and can't start or end with a hyphen.`
    });
  }
  // The skill installs as a folder of this name, and Windows can't create one named after a device.
  if (WINDOWS_DEVICE_NAME_RE.test(name)) {
    throw new BadRequestError({ message: `'${name}' is a reserved name and can't be used as a skill name.` });
  }

  if (description === undefined || description === null) {
    throw new BadRequestError({ message: `${AGENT_VAULT_SKILL_MANIFEST} header needs a 'description'.` });
  }
  if (typeof description !== "string") {
    throw new BadRequestError({
      message: `The 'description' in ${AGENT_VAULT_SKILL_MANIFEST} must be text. Put it in quotes.`
    });
  }
  const trimmedDescription = description.trim();
  if (!trimmedDescription.length) {
    throw new BadRequestError({ message: `${AGENT_VAULT_SKILL_MANIFEST} header needs a 'description'.` });
  }
  if (trimmedDescription.length > AGENT_VAULT_SKILL_DESCRIPTION_MAX_LENGTH) {
    throw new BadRequestError({
      message: `The 'description' in ${AGENT_VAULT_SKILL_MANIFEST} is longer than ${AGENT_VAULT_SKILL_DESCRIPTION_MAX_LENGTH} characters.`
    });
  }

  return { name, description: trimmedDescription };
};

const NAME_LINE_RE = /^(name[ \t]*:[ \t]*)(.*)$/;

// A plain `12`, `1e5`, `true` or `null` reads back as a number, boolean or null, which the header check refuses.
const loadsAsText = (name: string) => {
  try {
    return load(name, { schema: JSON_SCHEMA }) === name;
  } catch {
    return false;
  }
};

/**
 * Rewrites the value on the top-level `name:` line of a SKILL.md header and leaves every other byte alone (line
 * endings, a byte order mark, quoting and a trailing comment). Returns null when the header has no such line, for
 * example a name written as a block scalar or an alias, so the caller can refuse rather than guess.
 */
export const replaceSkillHeaderName = (content: Buffer, name: string): Buffer | null => {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content);
  } catch {
    return null;
  }

  const lines = text.split(/(?<=\n)/);
  const bare = (line: string) => line.replace(/^\uFEFF/, "").replace(/\r?\n$/, "");
  if (bare(lines[0] ?? "").trimEnd() !== "---") return null;

  for (let i = 1; i < lines.length; i += 1) {
    const ending = lines[i].match(/\r?\n$/)?.[0] ?? "";
    const line = lines[i].slice(0, lines[i].length - ending.length);
    if (line.trimEnd() === "---") return null;

    const match = NAME_LINE_RE.exec(line);
    if (match) {
      const [, prefix, rest] = match;
      let value: string;
      const quote = rest[0];
      if (quote === "'" || quote === '"') {
        const close = rest.indexOf(quote, 1);
        if (close === -1) return null;
        value = `${quote}${name}${quote}${rest.slice(close + 1)}`;
      } else {
        const comment = rest.search(/[ \t]#/);
        const end = comment === -1 ? rest.trimEnd().length : comment;
        const scalar = rest.slice(0, end).trimEnd();
        if (!scalar || /^[|>&*!{[]/.test(scalar)) return null;
        value = `${loadsAsText(name) ? name : JSON.stringify(name)}${rest.slice(scalar.length)}`;
      }
      lines[i] = `${prefix}${value}${ending}`;
      return Buffer.from(lines.join(""), "utf8");
    }
  }
  return null;
};

export const sha256Hex = (data: Buffer | string) => crypto.nativeCrypto.createHash("sha256").update(data).digest("hex");

/**
 * Checks a skill folder against the limits and returns it in canonical form: files sorted by path bytes and content
 * re-encoded, so the same folder always serializes, and hashes, the same way however the client encoded it.
 */
export const validateSkillFiles = (
  files: { path: string; mode: AgentVaultSkillFileMode; contentBase64: string }[]
): TValidatedSkill => {
  if (!files.length) {
    throw new BadRequestError({ message: `${AGENT_VAULT_SKILL_MANIFEST} is missing.` });
  }
  if (files.length > AGENT_VAULT_SKILL_MAX_FILES) {
    throw new BadRequestError({ message: `A skill can have at most ${AGENT_VAULT_SKILL_MAX_FILES} files.` });
  }

  // NFC and lowercase, so two paths that one file system would write to the same file can't both be listed.
  const fold = (path: string) => path.normalize("NFC").toLowerCase();
  const seen = new Map<string, string>();
  const folders = new Map<string, string>();
  let sizeBytes = 0;
  const decoded = files.map((file) => {
    assertValidPath(file.path);

    const folded = fold(file.path);
    const clash = seen.get(folded);
    if (clash !== undefined) {
      throw new BadRequestError({
        message:
          clash === file.path
            ? `File '${file.path}' is listed twice.`
            : `Files '${clash}' and '${file.path}' would be the same file on disk. File paths must be unique ignoring case.`
      });
    }
    seen.set(folded, file.path);
    const segments = file.path.split("/");
    segments.slice(0, -1).forEach((_, i) => {
      const folder = segments.slice(0, i + 1).join("/");
      if (!folders.has(fold(folder))) folders.set(fold(folder), file.path);
    });

    const content = decodeContent(file);
    if (content.length > AGENT_VAULT_SKILL_MAX_FILE_BYTES) {
      throw new BadRequestError({
        message: `File '${file.path}' is larger than ${AGENT_VAULT_SKILL_MAX_FILE_BYTES / 1024} KB.`
      });
    }
    sizeBytes += content.length;
    if (sizeBytes > AGENT_VAULT_SKILL_MAX_TOTAL_BYTES) {
      throw new BadRequestError({
        message: `The skill's files add up to more than ${AGENT_VAULT_SKILL_MAX_TOTAL_BYTES / (1024 * 1024)} MB.`
      });
    }
    return { path: file.path, mode: file.mode, content };
  });

  decoded.forEach((file) => {
    const inside = folders.get(fold(file.path));
    if (inside !== undefined) {
      throw new BadRequestError({
        message: `'${file.path}' is a file, but '${inside}' puts it inside a folder of the same name. Rename one of them.`
      });
    }
  });

  const manifest = decoded.find((file) => file.path === AGENT_VAULT_SKILL_MANIFEST);
  if (!manifest) {
    throw new BadRequestError({ message: `${AGENT_VAULT_SKILL_MANIFEST} is missing.` });
  }
  const { name, description } = parseSkillHeader(manifest.content);
  // A restore rewrites this line to keep the skill's current name, so every stored version must have one it can find.
  if (!replaceSkillHeaderName(manifest.content, name)) {
    throw new BadRequestError({
      message: `Write the name on a single line in ${AGENT_VAULT_SKILL_MANIFEST}, like 'name: ${name}'.`
    });
  }

  const canonical: TAgentVaultSkillFile[] = decoded
    // By UTF-8 bytes, the order Go sorts strings in, so the CLI's recomputed hash matches.
    .sort((a, b) => Buffer.compare(Buffer.from(a.path, "utf8"), Buffer.from(b.path, "utf8")))
    .map((file) => ({ path: file.path, mode: file.mode, contentBase64: file.content.toString("base64") }));
  const serialized = Buffer.from(JSON.stringify(canonical));

  return {
    name,
    description,
    files: canonical,
    serialized,
    sha256: sha256Hex(serialized),
    sizeBytes,
    fileCount: canonical.length
  };
};

export const deserializeSkillFiles = (serialized: Buffer) =>
  JSON.parse(serialized.toString("utf8")) as TAgentVaultSkillFile[];

export const skillSizeBucket = (sizeBytes: number) => {
  if (sizeBytes < 10 * 1024) return "lt-10kb";
  if (sizeBytes < 100 * 1024) return "10kb-100kb";
  return "100kb-1mb";
};
