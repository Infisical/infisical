import { diffLines } from "diff";
import { strFromU8, unzipSync, zipSync } from "fflate";
import { JSON_SCHEMA, load, YAMLException } from "js-yaml";

import { TAgentVaultSkillFile, TAgentVaultSkillFileMode } from "@app/hooks/api/agentVault/types";

export const SKILL_NAME_MAX_LENGTH = 64;
export const SKILL_DESCRIPTION_MAX_LENGTH = 1024;
export const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKILL_NAME_MESSAGE =
  "A skill name uses lower case letters, numbers and single hyphens, like code-review.";

export const SKILL_ENTRY_FILE = "SKILL.md";

// The server enforces these limits. They are repeated here only so an archive is never inflated past them: an entry's
// declared size bounds what fflate writes, so a small archive that would expand to gigabytes is refused unread.
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;
const MAX_FILES = 50;

export class SkillPackageError extends Error {}

const formatLimit = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${bytes / (1024 * 1024)} MB` : `${bytes / 1024} KB`;

export const formatSkillBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
};

export const base64ToBytes = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

/** The file's text, or null when it is not valid UTF-8 and so can't be shown. */
export const decodeSkillFile = (file: TAgentVaultSkillFile) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(base64ToBytes(file.contentBase64));
  } catch {
    return null;
  }
};

/** Uses forward slashes and drops leading `./` and `/`, as Windows archive tools and typed paths may not. */
export const normalizeSkillPath = (path: string) =>
  path
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^(\.\/|\/)+/, "");

// Archive tools add these beside the real files, and they would stop a single top-level folder from being stripped.
// Hidden entries are skipped too, as the CLI skips them on push, so both ways publish the same files.
const isArchiveNoise = (path: string) =>
  path.startsWith("__MACOSX/") || path.split("/").some((segment) => segment.startsWith("."));

const stripSharedFolder = (paths: string[]) => {
  const [first] = paths;
  const slash = first?.indexOf("/") ?? -1;
  if (slash <= 0) return paths;
  const prefix = first.slice(0, slash + 1);
  return paths.every((path) => path.startsWith(prefix))
    ? paths.map((path) => path.slice(prefix.length))
    : paths;
};

// Archive tools on macOS write UTF-8 names without the zip flag that says so, and fflate then reads each byte as a
// Latin-1 character. A name whose characters are all bytes and which decodes as UTF-8 is read as UTF-8 instead.
const decodeZipName = (name: string) => {
  const bytes = new Uint8Array(name.length);
  for (let i = 0; i < name.length; i += 1) {
    const code = name.charCodeAt(i);
    if (code > 0xff) return name;
    bytes[i] = code;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return name;
  }
};

const ZIP_END_OF_DIRECTORY = 0x06054b50;
const ZIP_DIRECTORY_ENTRY = 0x02014b50;
const ZIP_HOST_UNIX = 3;

// fflate doesn't expose an entry's external attributes, so the central directory is read here for the Unix mode bits.
// Names are decoded as fflate decodes them, so they match the names its filter sees.
const readZipExecutableNames = (data: Uint8Array) => {
  const executable = new Set<string>();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = data.length - 22;
  const stop = Math.max(0, end - 0xffff);
  while (end >= stop && view.getUint32(end, true) !== ZIP_END_OF_DIRECTORY) end -= 1;
  if (end < stop) return executable;

  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > data.length || view.getUint32(offset, true) !== ZIP_DIRECTORY_ENTRY) break;
    const host = view.getUint8(offset + 5);
    const flags = view.getUint16(offset + 8, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    // The high half of the external attributes holds the Unix mode.
    const unixMode = view.getUint16(offset + 40, true);
    const nameBytes = data.subarray(offset + 46, offset + 46 + nameLength);
    // eslint-disable-next-line no-bitwise
    const name = strFromU8(nameBytes, !(flags & 0x800));
    // eslint-disable-next-line no-bitwise
    if (host === ZIP_HOST_UNIX && unixMode & 0o111) executable.add(name);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return executable;
};

const readZip = (data: Uint8Array): TAgentVaultSkillFile[] => {
  let count = 0;
  let total = 0;
  let entries: Record<string, Uint8Array>;
  const names: string[] = [];
  try {
    entries = unzipSync(data, {
      filter: ({ name: rawName, originalSize }) => {
        const name = normalizeSkillPath(decodeZipName(rawName));
        if (rawName.endsWith("/") || rawName.endsWith("\\") || isArchiveNoise(name)) return false;
        count += 1;
        total += originalSize;
        if (originalSize > MAX_FILE_BYTES) {
          throw new SkillPackageError(
            `File '${name}' is larger than ${formatLimit(MAX_FILE_BYTES)}.`
          );
        }
        if (count > MAX_FILES) {
          throw new SkillPackageError(`A skill can hold at most ${MAX_FILES} files.`);
        }
        if (total > MAX_TOTAL_BYTES) {
          throw new SkillPackageError(
            `A skill can be at most ${formatLimit(MAX_TOTAL_BYTES)} in total.`
          );
        }
        names.push(rawName);
        return true;
      }
    });
  } catch (error) {
    if (error instanceof SkillPackageError) throw error;
    throw new SkillPackageError("This file is not a valid zip archive.");
  }

  if (names.length === 0) throw new SkillPackageError("This archive holds no files.");
  const paths = stripSharedFolder(names.map((name) => normalizeSkillPath(decodeZipName(name))));

  const executable = readZipExecutableNames(data);

  return names.map((name, index) => ({
    path: paths[index],
    mode: executable.has(name) ? ("0755" as const) : ("0644" as const),
    contentBase64: bytesToBase64(entries[name])
  }));
};

/** SKILL.md first, then the rest by path, as the skill's files are listed. */
export const sortSkillFiles = <T extends { path: string }>(files: T[]) =>
  [...files].sort((a, b) => {
    if (a.path === SKILL_ENTRY_FILE) return -1;
    if (b.path === SKILL_ENTRY_FILE) return 1;
    return a.path.localeCompare(b.path);
  });

/**
 * Reads an uploaded skill: a zip of the skill's folder, or a single Markdown file that becomes its SKILL.md. Only
 * the archive's size is checked here; the server validates everything else and its message is shown as is.
 */
export const readSkillUpload = async (file: File): Promise<TAgentVaultSkillFile[]> => {
  const name = file.name.toLowerCase();

  if (name.endsWith(".md")) {
    if (file.size > MAX_FILE_BYTES) {
      throw new SkillPackageError(
        `File '${file.name}' is larger than ${formatLimit(MAX_FILE_BYTES)}.`
      );
    }
    return [
      {
        path: SKILL_ENTRY_FILE,
        mode: "0644",
        contentBase64: bytesToBase64(new Uint8Array(await file.arrayBuffer()))
      }
    ];
  }

  if (name.endsWith(".zip")) {
    // Stored entries make a zip slightly larger than its files, never by more than the headers.
    if (file.size > MAX_TOTAL_BYTES + 64 * 1024) {
      throw new SkillPackageError(
        `A skill can be at most ${formatLimit(MAX_TOTAL_BYTES)} in total.`
      );
    }
    return readZip(new Uint8Array(await file.arrayBuffer()));
  }

  throw new SkillPackageError("Upload a .zip of the skill's folder, or a single .md file.");
};

export const toSkillFile = (path: string, text: string): TAgentVaultSkillFile => ({
  path,
  mode: "0644",
  contentBase64: bytesToBase64(new TextEncoder().encode(text))
});

export const isMarkdownPath = (path: string) => /\.(md|markdown)$/i.test(path);

/** A file as the editor holds it: text for anything that decodes as UTF-8, else the original bytes, read only. */
export type TSkillDraftFile = {
  path: string;
  mode: TAgentVaultSkillFileMode;
  text: string | null;
  contentBase64: string;
};

export const toDraftFiles = (files: TAgentVaultSkillFile[]): TSkillDraftFile[] =>
  sortSkillFiles(files).map((file) => ({ ...file, text: decodeSkillFile(file) }));

/**
 * A file whose text is unchanged keeps its original bytes, so a byte order mark or an encoding detail the editor
 * doesn't show is not lost and the file doesn't appear changed.
 */
export const fromDraftFiles = (files: TSkillDraftFile[]): TAgentVaultSkillFile[] =>
  files.map(({ path, mode, text, contentBase64 }) =>
    text === null ||
    (contentBase64 !== "" && decodeSkillFile({ path, mode, contentBase64 }) === text)
      ? { path, mode, contentBase64 }
      : { ...toSkillFile(path, text), mode }
  );

export const newDraftFile = (path: string, text = ""): TSkillDraftFile => ({
  path,
  mode: "0644",
  text,
  contentBase64: ""
});

export const SKILL_MAX_FILES = MAX_FILES;
export const SKILL_MAX_PATH_LENGTH = 255;
const SKILL_MAX_SEGMENT_BYTES = 255;
export const AGENT_VAULT_MAX_SKILLS_PER_BUNDLE = 25;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/;
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const WINDOWS_INVALID_CHARS_RE = /[:<>"|?*]/;
const WINDOWS_DEVICE_NAME_RE = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

export const isReservedSkillName = (name: string) => WINDOWS_DEVICE_NAME_RE.test(name);

export const getReservedSkillNameMessage = (name: string) =>
  `'${name}' is a reserved name and can't be used as a skill name.`;

/** Why the server would refuse a file path, or null. Mirrors assertValidPath in the backend's agent-vault-skill-fns.ts. */
export const getSkillPathError = (path: string): string | null => {
  if (!path.length) return "Enter a name.";
  if (LONE_SURROGATE_RE.test(path)) return "A name must be valid Unicode text.";
  if (path.length > SKILL_MAX_PATH_LENGTH)
    return `A path can be at most ${SKILL_MAX_PATH_LENGTH} characters, including its folders.`;
  if (CONTROL_CHARS_RE.test(path)) return "A name can't contain control characters.";
  if (path.includes("\\")) return "A name can't contain a backslash.";
  const segments = path.split("/");
  if (path.startsWith("/") || segments.some((s) => s === "" || s === "." || s === ".."))
    return "A name can't be empty, '.' or '..'.";
  const encoder = new TextEncoder();
  const tooLong = segments.find((s) => encoder.encode(s).length > SKILL_MAX_SEGMENT_BYTES);
  if (tooLong !== undefined)
    return `File name '${tooLong.slice(0, 64)}…' in '${path}' is too long. Shorten it.`;
  if (WINDOWS_INVALID_CHARS_RE.test(path)) return "A name can't contain any of : < > \" | ? *";
  const trailing = segments.find((s) => s.endsWith(".") || s.endsWith(" "));
  if (trailing !== undefined) return `'${trailing}' can't end in a dot or a space.`;
  const device = segments.find((s) => WINDOWS_DEVICE_NAME_RE.test(s));
  if (device !== undefined) return `'${device}' is a reserved name and can't be used.`;
  return null;
};

// The server compares paths this way, since one file system may write both spellings to the same file.
const foldSkillPath = (path: string) => path.normalize("NFC").toLowerCase();

export const joinSkillPath = (parentPath: string, name: string) =>
  parentPath ? `${parentPath}/${name}` : name;

export const getSkillParentPath = (path: string) => {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
};

/**
 * The skill path a relative link in `fromPath` points at, the way an agent reading the folder would follow it.
 * A leading slash means the skill's root. Null for a link to a heading only, or one that climbs out of the skill.
 */
export const resolveSkillLinkPath = (fromPath: string, href: string): string | null => {
  const [target] = href.split(/[?#]/);
  if (!target) return null;
  let decoded = target;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    // A stray % is part of the name.
  }
  const segments = decoded.startsWith("/")
    ? []
    : getSkillParentPath(fromPath).split("/").filter(Boolean);
  for (const segment of decoded.split("/")) {
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else if (segment !== "" && segment !== ".") {
      segments.push(segment);
    }
  }
  return segments.length ? segments.join("/") : null;
};

export const getSkillBaseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const isSameOrInside = (path: string, folder: string) =>
  path === folder || path.startsWith(`${folder}/`);

/** Every folder that holds one of the files, plus any empty folders given. */
export const getSkillFolders = (
  filePaths: readonly string[],
  emptyFolders: readonly string[] = []
) => {
  const folders = new Set<string>(emptyFolders);
  filePaths.forEach((path) => {
    const segments = path.split("/");
    segments
      .slice(0, -1)
      .forEach((_, index) => folders.add(segments.slice(0, index + 1).join("/")));
  });
  return [...folders];
};

type TSkillEntryCheck = {
  name: string;
  parentPath: string;
  filePaths: readonly string[];
  folderPaths: readonly string[];
  /** The file or folder being renamed. It and anything inside it don't count as clashes. */
  renamingPath?: string;
};

/** Why a name typed in the file tree can't be used, or null when it can. */
export const getSkillEntryNameError = ({
  name,
  parentPath,
  filePaths,
  folderPaths,
  renamingPath
}: TSkillEntryCheck): string | null => {
  if (!name) return "Enter a name.";
  if (name.includes("/")) return "A name can't contain '/'. Use New Folder to add a folder.";
  const path = joinSkillPath(parentPath, name);
  const pathError = getSkillPathError(path);
  if (pathError) return pathError;

  const isMoved = (existing: string) =>
    renamingPath !== undefined && isSameOrInside(existing, renamingPath);
  if (renamingPath !== undefined) {
    const longest = filePaths
      .filter(isMoved)
      .reduce(
        (max, existing) => Math.max(max, path.length + existing.length - renamingPath.length),
        0
      );
    if (longest > SKILL_MAX_PATH_LENGTH)
      return `A file inside would have a path longer than ${SKILL_MAX_PATH_LENGTH} characters.`;
  }

  const folded = foldSkillPath(path);
  const clash = (paths: readonly string[]) =>
    paths.find((existing) => !isMoved(existing) && foldSkillPath(existing) === folded);
  const caseNote = (existing: string) =>
    existing === path ? "" : " Names must be unique ignoring case.";
  const file = clash(filePaths);
  if (file) return `A file named '${getSkillBaseName(file)}' is already here.${caseNote(file)}`;
  const folder = clash(folderPaths);
  if (folder)
    return `A folder named '${getSkillBaseName(folder)}' is already here.${caseNote(folder)}`;
  return null;
};

/** Moves a file, or a folder with everything in it, to a new path. */
export const renameSkillPaths = <T extends { path: string }>(
  files: readonly T[],
  from: string,
  to: string
): T[] =>
  files.map((file) =>
    isSameOrInside(file.path, from) ? { ...file, path: to + file.path.slice(from.length) } : file
  );

export const renameSkillFolders = (folders: readonly string[], from: string, to: string) =>
  folders.map((folder) => (isSameOrInside(folder, from) ? to + folder.slice(from.length) : folder));

/** Drops a file, or a folder with everything in it. */
export const removeSkillPath = <T extends string | { path: string }>(
  items: readonly T[],
  path: string
) => items.filter((item) => !isSameOrInside(typeof item === "string" ? item : item.path, path));

/**
 * Reads a SKILL.md YAML header the way the server does, with js-yaml's JSON schema. Returns null when it is not valid
 * YAML or not a list of `key: value` lines.
 */
export const parseSkillHeader = (frontmatter: string): Record<string, unknown> | null => {
  let parsed: unknown;
  try {
    parsed = load(frontmatter, { schema: JSON_SCHEMA });
  } catch {
    return null;
  }
  if (parsed === undefined || parsed === null) return {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
};

const QUOTED_OR_FLOW_START = ['"', "'", "|", ">", "[", "{"];

// The usual way a hand-written header breaks: an unquoted value such as `description: Review: then fix`.
const findUnquotedColonValue = (lines: string[]) => {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const first = line[0];
    if (first !== undefined && first !== " " && first !== "\t" && first !== "#" && first !== "-") {
      const separator = line.indexOf(": ");
      if (separator > 0) {
        const value = line.slice(separator + 2).trimStart();
        const comment = value.indexOf(" #");
        const scalar = comment === -1 ? value : value.slice(0, comment);
        if (scalar.length && !QUOTED_OR_FLOW_START.includes(scalar[0]) && scalar.includes(": "))
          return { line: i, key: line.slice(0, separator).trimEnd() };
      }
    }
  }
  return null;
};

const UNCLOSED_VALUE_OPENERS = ["[", "{", '"', "'"];
const QUOTE_MAY_FOLLOW = ["", "[", "{", ",", ":"];

const isBlank = (char: string | undefined) => char === " " || char === "\t" || char === "\n";

// A flow or quoted value may continue on indented lines, so its whole block is scanned before calling it unclosed.
const valueCloses = (text: string) => {
  let depth = 0;
  let quote = "";
  let previous = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote === '"') {
      if (char === "\\") {
        i += 1;
      } else if (char === '"') {
        if (depth === 0) return true;
        quote = "";
        previous = char;
      }
    } else if (quote === "'") {
      if (char === "'" && text[i + 1] === "'") {
        i += 1;
      } else if (char === "'") {
        if (depth === 0) return true;
        quote = "";
        previous = char;
      }
    } else if (char === "#" && (i === 0 || isBlank(text[i - 1]))) {
      const newline = text.indexOf("\n", i);
      if (newline === -1) return false;
      i = newline;
    } else if ((char === '"' || char === "'") && QUOTE_MAY_FOLLOW.includes(previous)) {
      quote = char;
    } else {
      if (char === "[" || char === "{") depth += 1;
      if (char === "]" || char === "}") {
        depth -= 1;
        if (depth === 0) return true;
      }
      if (!isBlank(char)) previous = char;
    }
  }
  return false;
};

// A quoted or flow value may continue on lines that start at column zero, and comments may sit between its lines,
// so only the next top-level key ends it.
const startsTopLevelKey = (line: string) => {
  const first = line[0];
  if (first === undefined || first === " " || first === "\t" || first === "#" || first === "-")
    return false;
  const colon = line.indexOf(":");
  return (
    colon > 0 && (colon === line.length - 1 || line[colon + 1] === " " || line[colon + 1] === "\t")
  );
};

const findUnclosedValue = (headerLines: string[]) => {
  for (let i = 0; i < headerLines.length; i += 1) {
    const line = headerLines[i];
    const first = line[0];
    if (first !== undefined && first !== " " && first !== "\t" && first !== "#" && first !== "-") {
      const separator = line.indexOf(": ");
      if (separator > 0) {
        const value = line.slice(separator + 2).trimStart();
        if (UNCLOSED_VALUE_OPENERS.includes(value[0])) {
          let end = i + 1;
          while (end < headerLines.length && !startsTopLevelKey(headerLines[end])) end += 1;
          if (!valueCloses([value, ...headerLines.slice(i + 1, end)].join("\n"))) {
            return { line: i, key: line.slice(0, separator).trimEnd(), opener: value[0] };
          }
        }
      }
    }
  }
  return null;
};

const describeOpener = (opener: string) => {
  if (opener === '"') return "a double quote";
  if (opener === "'") return "a single quote";
  return `a '${opener}'`;
};

/**
 * Why a SKILL.md header can't be read, in the words the server and CLI use, or null when it can. Mirrors
 * yamlErrorMessage in the backend's agent-vault-skill-fns.ts.
 */
export const getSkillHeaderError = (frontmatter: string): string | null => {
  try {
    load(frontmatter, { schema: JSON_SCHEMA });
  } catch (error) {
    // The header starts on the line after the opening '---', so its first line is line 2 of the file.
    const lines = frontmatter.split(/\r?\n/);
    const unquoted = findUnquotedColonValue(lines);
    if (unquoted)
      return `Line ${unquoted.line + 2} of ${SKILL_ENTRY_FILE}: the '${unquoted.key}' value contains ': '. Put the value in double quotes.`;
    const unclosed = findUnclosedValue(lines);
    if (unclosed)
      return `Line ${unclosed.line + 2} of ${SKILL_ENTRY_FILE}: the '${unclosed.key}' value opens ${describeOpener(unclosed.opener)} that never closes.`;
    if (error instanceof YAMLException && typeof error.mark?.line === "number") {
      const reason = (error.reason ?? "").split("\n")[0].trim().replace(/\.+$/, "");
      if (reason)
        return `Line ${error.mark.line + 2} of ${SKILL_ENTRY_FILE}: the header is not valid YAML (${reason}).`;
    }
    return `The header in ${SKILL_ENTRY_FILE} is not valid YAML.`;
  }
  return parseSkillHeader(frontmatter)
    ? null
    : `The header in ${SKILL_ENTRY_FILE} is not valid YAML.`;
};

/** A header value as a text field shows it: `12` as "12", and a missing or empty value as "". */
export const getSkillHeaderText = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

// Plain strings that YAML 1.1 parsers, such as Python's, read as booleans or null.
const YAML_1_1_KEYWORD_RE = /^(?:y|n|yes|no|on|off|true|false|null|~)$/i;

/** Writes a header value plain when YAML reads it back as the same string, else as a double-quoted JSON string. */
export const formatSkillHeaderValue = (value: string) => {
  if (YAML_1_1_KEYWORD_RE.test(value)) return JSON.stringify(value);
  try {
    if ((load(`v: ${value}`, { schema: JSON_SCHEMA }) as { v?: unknown } | null)?.v === value)
      return value;
  } catch {
    // Not valid as a plain value, so it is quoted below.
  }
  return JSON.stringify(value);
};

const FRONTMATTER_RE = /^(---[ \t]*\r?\n)(?:([\s\S]*?)\r?\n)??(---[ \t]*(?:\r?\n|$))/;

/**
 * Sets one top-level key in a SKILL.md header and leaves every other line of the file as it was. A value written over
 * several indented lines is replaced as a whole. Adds the key when the header lacks it, and a header when there is none.
 */
export const setSkillHeaderValue = (text: string, key: string, value: string) => {
  const match = FRONTMATTER_RE.exec(text);
  if (!match) return `---\n${key}: ${formatSkillHeaderValue(value)}\n---\n\n${text}`;

  const [whole, open, header, close] = match;
  const eol = open.endsWith("\r\n") ? "\r\n" : "\n";
  const lines = header === undefined ? [] : header.split(/\r?\n/);
  const keyForms = [key, `"${key}"`, `'${key}'`];
  const start = lines.findIndex((line) =>
    keyForms.some((form) => line.startsWith(form) && /^[ \t]*:/.test(line.slice(form.length)))
  );
  // A value already in double quotes stays quoted, so typing a trailing space doesn't flip the line on each keystroke.
  const isQuoted = start !== -1 && /^[^:]*:[ \t]*"/.test(lines[start]);
  const entry = `${key}: ${isQuoted ? JSON.stringify(value) : formatSkillHeaderValue(value)}`;
  if (start === -1) {
    lines.push(entry);
  } else {
    let end = start;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^[ \t]/.test(lines[i])) end = i;
      else if (lines[i].trim() !== "") break;
    }
    lines.splice(start, end - start + 1, entry);
  }
  return `${open}${lines.join(eol)}${eol}${close}${text.slice(whole.length)}`;
};

const countLines = (text: string) => {
  if (text === "") return 0;
  const lines = text.split("\n");
  return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
};

export const countLineChanges = (oldText: string, newText: string) => {
  let additions = 0;
  let deletions = 0;
  diffLines(oldText, newText).forEach((change) => {
    if (change.added) additions += countLines(change.value);
    if (change.removed) deletions += countLines(change.value);
  });
  return { additions, deletions };
};

export type TSkillFileChange = {
  path: string;
  status: "added" | "modified" | "deleted";
  oldText: string | null;
  newText: string | null;
  isBinary: boolean;
  /** Too large to diff in the browser; its line counts are not known when it was modified. */
  isTooLarge: boolean;
  additions: number;
  deletions: number;
  oldMode?: TAgentVaultSkillFileMode;
  newMode?: TAgentVaultSkillFileMode;
};

const isSameDraftFile = (before: TSkillDraftFile, file: TSkillDraftFile) =>
  before.mode === file.mode &&
  (file.text === null ? before.contentBase64 === file.contentBase64 : before.text === file.text);

/**
 * The paths a draft adds or changes, and whether it changes anything at all, without diffing any text. Cheap enough
 * to run on every keystroke.
 */
export const getChangedSkillPaths = (original: TSkillDraftFile[], draft: TSkillDraftFile[]) => {
  const originalByPath = new Map(original.map((file) => [file.path, file]));
  const changedPaths = new Set<string>();
  draft.forEach((file) => {
    const before = originalByPath.get(file.path);
    if (!before || !isSameDraftFile(before, file)) changedPaths.add(file.path);
  });
  const draftPaths = new Set(draft.map((file) => file.path));
  const hasChanges = changedPaths.size > 0 || original.some((file) => !draftPaths.has(file.path));
  return { changedPaths, hasChanges };
};

const DIFF_MAX_LINES = 2000;
const DIFF_MAX_CHARS = 200 * 1024;

const isTooLargeToDiff = (...texts: (string | null)[]) =>
  texts.some(
    (text) => text !== null && (text.length > DIFF_MAX_CHARS || countLines(text) > DIFF_MAX_LINES)
  );

/** What a draft changes against the files it started from, in the draft's order with deleted files last. */
export const getSkillFileChanges = (
  original: TSkillDraftFile[],
  draft: TSkillDraftFile[]
): TSkillFileChange[] => {
  const originalByPath = new Map(original.map((file) => [file.path, file]));
  const draftPaths = new Set(draft.map((file) => file.path));
  const changes: TSkillFileChange[] = [];

  draft.forEach((file) => {
    const before = originalByPath.get(file.path);
    const isBinary = file.text === null;
    if (!before) {
      changes.push({
        path: file.path,
        status: "added",
        oldText: null,
        newText: file.text,
        isBinary,
        isTooLarge: isTooLargeToDiff(file.text),
        additions: countLines(file.text ?? ""),
        deletions: 0,
        newMode: file.mode
      });
      return;
    }
    const isContentChanged = isBinary
      ? before.contentBase64 !== file.contentBase64
      : before.text !== file.text;
    if (!isContentChanged && before.mode === file.mode) return;
    const isTooLarge = isTooLargeToDiff(before.text, file.text);
    changes.push({
      path: file.path,
      status: "modified",
      oldText: before.text,
      newText: file.text,
      isBinary,
      isTooLarge,
      ...(isBinary || !isContentChanged || isTooLarge
        ? { additions: 0, deletions: 0 }
        : countLineChanges(before.text ?? "", file.text ?? "")),
      ...(before.mode !== file.mode && { oldMode: before.mode, newMode: file.mode })
    });
  });

  original.forEach((file) => {
    if (draftPaths.has(file.path)) return;
    changes.push({
      path: file.path,
      status: "deleted",
      oldText: file.text,
      newText: null,
      isBinary: file.text === null,
      isTooLarge: isTooLargeToDiff(file.text),
      additions: 0,
      deletions: countLines(file.text ?? ""),
      oldMode: file.mode
    });
  });

  return changes;
};

export type TDiffRow =
  | {
      type: "context" | "added" | "removed";
      text: string;
      oldLine: number | null;
      newLine: number | null;
    }
  | { type: "skip"; count: number };

const splitLines = (value: string) => {
  const lines = value.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
};

const NO_FINAL_NEWLINE = "\\ No newline at end of file";

/** A unified line diff, with unchanged runs longer than twice `context` folded into a skip row. */
export const buildDiffRows = (oldText: string, newText: string, context = 3): TDiffRow[] => {
  const rows: TDiffRow[] = [];
  let oldLine = 1;
  let newLine = 1;

  const endsWithNewline = (text: string) => text === "" || text.endsWith("\n");
  const isFinalNewlineChanged = endsWithNewline(oldText) !== endsWithNewline(newText);

  const changes = diffLines(oldText, newText);
  changes.forEach((change, index) => {
    const lines = splitLines(change.value);
    if (change.added || change.removed) {
      lines.forEach((text) => {
        rows.push({
          type: change.added ? "added" : "removed",
          text,
          oldLine: change.added ? null : oldLine,
          newLine: change.added ? newLine : null
        });
        if (change.added) newLine += 1;
        else oldLine += 1;
      });
      if (isFinalNewlineChanged && !endsWithNewline(change.value))
        rows.push({ type: "context", text: NO_FINAL_NEWLINE, oldLine: null, newLine: null });
      return;
    }

    const head = index === 0 ? 0 : context;
    const tail = index === changes.length - 1 ? 0 : context;
    const toRow = (text: string, offset: number): TDiffRow => ({
      type: "context",
      text,
      oldLine: oldLine + offset,
      newLine: newLine + offset
    });

    if (lines.length <= head + tail + 1) {
      lines.forEach((text, offset) => rows.push(toRow(text, offset)));
    } else {
      lines.slice(0, head).forEach((text, offset) => rows.push(toRow(text, offset)));
      rows.push({ type: "skip", count: lines.length - head - tail });
      lines
        .slice(lines.length - tail)
        .forEach((text, offset) => rows.push(toRow(text, lines.length - tail + offset)));
    }
    oldLine += lines.length;
    newLine += lines.length;
  });

  return rows;
};

/**
 * Keeps a file the archive marks executable as such, and gives every other file the mode the same path had before,
 * since archives made on Windows carry no modes at all.
 */
export const carrySkillFileModes = (
  files: TAgentVaultSkillFile[],
  previous: TAgentVaultSkillFile[]
): TAgentVaultSkillFile[] => {
  const modes = new Map(previous.map((file) => [file.path, file.mode]));
  return files.map((file) =>
    file.mode === "0755" ? file : { ...file, mode: modes.get(file.path) ?? file.mode }
  );
};

/** Swaps in a new SKILL.md and keeps every other file of the previous version as it was. */
export const replaceSkillEntryFile = (
  previous: TAgentVaultSkillFile[],
  entry: TAgentVaultSkillFile
): TAgentVaultSkillFile[] => {
  const existing = previous.find((file) => file.path === SKILL_ENTRY_FILE);
  return [
    { ...entry, mode: existing?.mode ?? entry.mode },
    ...previous.filter((file) => file.path !== SKILL_ENTRY_FILE)
  ];
};

/** The skill's files in a zip under one folder named after it, with executable files marked as such. */
export const buildSkillZip = (folder: string, files: TAgentVaultSkillFile[]) =>
  zipSync(
    Object.fromEntries(
      files.map((file) => [
        `${folder}/${file.path}`,
        [
          base64ToBytes(file.contentBase64),
          { os: 3, attrs: (file.mode === "0755" ? 0o100755 : 0o100644) * 0x10000 }
        ]
      ])
    )
  );

/** Splits a leading YAML header off Markdown, so it can be shown apart from the rendered body. */
export const splitFrontmatter = (text: string) => {
  const match = FRONTMATTER_RE.exec(text);
  if (!match) return { frontmatter: null, body: text };
  return { frontmatter: match[2] ?? "", body: text.slice(match[0].length) };
};

/** The name a SKILL.md's header gives, when its text has a header with one. */
export const getSkillEntryName = (text: string | null | undefined) => {
  if (!text) return undefined;
  const { frontmatter } = splitFrontmatter(text);
  const name = frontmatter === null ? undefined : parseSkillHeader(frontmatter)?.name;
  return typeof name === "string" && name ? name : undefined;
};
