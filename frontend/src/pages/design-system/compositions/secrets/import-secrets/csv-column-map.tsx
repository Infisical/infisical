import type { ReactNode } from "react";
import { AsteriskIcon, CodeXmlIcon, MessageSquareIcon, TagsIcon, WrapTextIcon } from "lucide-react";

import type { CsvDelimiter } from "@app/components/utilities/parseSecrets";
import { Icon } from "@app/components/v4/ui/icon";
import type { TParsedEnv } from "@app/pages/secret-manager/OverviewPage/components/SecretDropzone/types";

import styles from "./import-secrets.module.css";

export type SecretMatrixMap = {
  key: number;
  value: number | null;
  comment: number | null;
  tags: number | null;
  metadata: number | null;
  skipMultilineEncoding: number | null;
};

type MapKey = keyof SecretMatrixMap;

const TRUTHY_VALUES = new Set(["true", "1", "yes", "y", "t"]);

export const pickInnerSeparator = (primaryDelimiter: CsvDelimiter): "," | ";" =>
  primaryDelimiter === "," ? ";" : ",";

const HEADER_ALIASES: Record<MapKey, string[]> = {
  key: ["key", "name", "secret", "secret_key", "secretkey", "secret_name", "secretname"],
  value: ["value", "val", "secret_value", "secretvalue"],
  comment: ["comment", "comments", "description", "note", "notes"],
  tags: ["tag", "tags", "labels", "label"],
  metadata: ["metadata", "meta"],
  skipMultilineEncoding: [
    "skip_ml",
    "skipml",
    "skip_multiline",
    "skipmultiline",
    "skip_multiline_encoding",
    "skipmultilineencoding",
    "multiline",
    "multiline_encoding",
    "multilineencoding"
  ]
};

export const buildInitialMatrixMap = (headers: string[]): SecretMatrixMap => {
  const normalized = headers.map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_")
  );
  const used = new Set<number>();
  const pick = (aliases: string[]): number | null => {
    const idx = normalized.findIndex((h, i) => !used.has(i) && aliases.includes(h));
    if (idx === -1) return null;
    used.add(idx);
    return idx;
  };

  let keyIdx = pick(HEADER_ALIASES.key);
  const value = pick(HEADER_ALIASES.value);
  const comment = pick(HEADER_ALIASES.comment);
  const tags = pick(HEADER_ALIASES.tags);
  const metadata = pick(HEADER_ALIASES.metadata);
  const skipMultilineEncoding = pick(HEADER_ALIASES.skipMultilineEncoding);

  if (keyIdx === null) {
    const firstFree = headers.findIndex((_, i) => !used.has(i));
    keyIdx = firstFree === -1 ? 0 : firstFree;
  }

  return { key: keyIdx, value, comment, tags, metadata, skipMultilineEncoding };
};

const parseTagCell = (cell: string, innerSeparator: string): string[] => [
  ...new Set(
    cell
      .split(innerSeparator)
      .map((s) => s.trim())
      .filter(Boolean)
  )
];

const parseMetadataCell = (cell: string, innerSeparator: string) => {
  const pairs: { key: string; value: string }[] = [];
  let malformed = false;
  if (!cell.trim()) return { pairs, malformed };
  cell.split(innerSeparator).forEach((chunk) => {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) {
      malformed = true;
      return;
    }
    const key = trimmed.slice(0, eqIdx).trim();
    if (!key) {
      malformed = true;
      return;
    }
    pairs.push({ key, value: trimmed.slice(eqIdx + 1).trim() });
  });
  return { pairs, malformed };
};

export const mapCsvMatrix = (
  matrix: string[][],
  map: SecretMatrixMap,
  innerSeparator: "," | ";"
) => {
  const env: TParsedEnv = {};
  let malformedMetadataRows = 0;
  matrix.forEach((row) => {
    const key = row[map.key];
    if (!key) return;
    const entry: TParsedEnv[string] = {
      value: map.value !== null ? row[map.value] || "" : "",
      comments: map.comment !== null ? [row[map.comment] || ""] : []
    };
    if (map.tags !== null) {
      const tagSlugs = parseTagCell(row[map.tags] || "", innerSeparator);
      if (tagSlugs.length) entry.tagSlugs = tagSlugs;
    }
    if (map.metadata !== null) {
      const { pairs, malformed } = parseMetadataCell(row[map.metadata] || "", innerSeparator);
      if (malformed) malformedMetadataRows += 1;
      if (pairs.length) entry.secretMetadata = pairs;
    }
    if (map.skipMultilineEncoding !== null) {
      const raw = row[map.skipMultilineEncoding];
      if (raw?.trim()) entry.skipMultilineEncoding = TRUTHY_VALUES.has(raw.trim().toLowerCase());
    }
    env[key] = entry;
  });
  return { env, malformedMetadataRows };
};

const formatDelimiter = (d: CsvDelimiter) => (d === "\t" ? "tab" : d);

const code = (text: string) => <code className={styles.code}>{text}</code>;

export const MATRIX_ROWS: {
  mapKey: MapKey;
  label: string;
  icon: ReactNode;
  hint?: (innerSeparator: "," | ";", outerDelimiter: CsvDelimiter) => ReactNode;
}[] = [
  { mapKey: "key", label: "Secret key", icon: <Icon name="key" size={12} /> },
  { mapKey: "value", label: "Secret value", icon: <Icon icon={AsteriskIcon} size={12} /> },
  { mapKey: "comment", label: "Comment", icon: <Icon icon={MessageSquareIcon} size={12} /> },
  {
    mapKey: "tags",
    label: "Tags",
    icon: <Icon icon={TagsIcon} size={12} />,
    hint: (sep, outer) => (
      <span className={styles.hintLines}>
        <span>
          Separate multiple tag slugs with either {code(",")} or {code(";")}, whichever is not your
          CSV&apos;s column delimiter.
        </span>
        <span>
          Detected column delimiter: {code(formatDelimiter(outer))}, so use {code(sep)} (e.g.{" "}
          {code(`prod${sep}api`)}).
        </span>
        <span>Missing tags are auto-created if you have permission.</span>
      </span>
    )
  },
  {
    mapKey: "metadata",
    label: "Metadata",
    icon: <Icon icon={CodeXmlIcon} size={12} />,
    hint: (sep, outer) => (
      <span className={styles.hintLines}>
        <span>
          Provide {code("key=value")} pairs separated by either {code(",")} or {code(";")},
          whichever is not your CSV&apos;s column delimiter.
        </span>
        <span>
          Detected column delimiter: {code(formatDelimiter(outer))}, so use {code(sep)} (e.g.{" "}
          {code(`owner=team-a${sep}tier=p0`)}).
        </span>
      </span>
    )
  },
  {
    mapKey: "skipMultilineEncoding",
    label: "Multi-line encoding",
    icon: <Icon icon={WrapTextIcon} size={12} />,
    hint: () => (
      <span>
        Truthy cells ({code("true")}, {code("1")}, {code("yes")}) enable multi-line encoding;
        anything else leaves it disabled.
      </span>
    )
  }
];
