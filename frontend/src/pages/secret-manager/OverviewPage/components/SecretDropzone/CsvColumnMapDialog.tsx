import { Dispatch, ReactNode, SetStateAction, useState } from "react";
import {
  ArrowRightIcon,
  AsteriskIcon,
  CodeXmlIcon,
  InfoIcon,
  KeyIcon,
  MessageSquareIcon,
  TagsIcon,
  WrapTextIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { CsvDelimiter } from "@app/components/utilities/parseSecrets";
import { FormLabel } from "@app/components/v2";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

import { TParsedEnv } from "./types";

type SecretMatrixMap = {
  key: number;
  value: number | null;
  comment: number | null;
  tags: number | null;
  metadata: number | null;
  skipMultilineEncoding: number | null;
};

type MapKey = keyof SecretMatrixMap;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  headers: string[];
  matrix: string[][];
  delimiter: CsvDelimiter;
  onParsedSecrets: (env: TParsedEnv) => void;
};

const TRUTHY_VALUES = new Set(["true", "1", "yes", "y", "t"]);

// Prefer `,` since it's the most natural list separator;
// fall back to `;` only when `,` is itself the outer CSV delimiter.
const pickInnerSeparator = (primaryDelimiter: CsvDelimiter): "," | ";" =>
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

const buildInitialMatrixMap = (headers: string[]): SecretMatrixMap => {
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

const parseMetadataCell = (
  cell: string,
  innerSeparator: string
): { pairs: { key: string; value: string }[]; malformed: boolean } => {
  if (!cell.trim()) return { pairs: [], malformed: false };
  const pairs: { key: string; value: string }[] = [];
  let malformed = false;
  cell.split(innerSeparator).forEach((chunk) => {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) {
      malformed = true;
      return;
    }
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!key) {
      malformed = true;
      return;
    }
    pairs.push({ key, value });
  });
  return { pairs, malformed };
};

const parseBooleanCell = (cell: string): boolean => TRUTHY_VALUES.has(cell.trim().toLowerCase());

const formatDelimiter = (d: CsvDelimiter): string => (d === "\t" ? "tab" : d);

type MatrixRow = {
  mapKey: MapKey;
  label: string;
  icon: ReactNode;
  hint?: (innerSeparator: "," | ";", outerDelimiter: CsvDelimiter) => ReactNode;
};

const MATRIX_ROWS: MatrixRow[] = [
  { mapKey: "key", label: "Secret Key", icon: <KeyIcon /> },
  { mapKey: "value", label: "Secret Value", icon: <AsteriskIcon /> },
  { mapKey: "comment", label: "Comment", icon: <MessageSquareIcon /> },
  {
    mapKey: "tags",
    label: "Tags",
    icon: <TagsIcon />,
    hint: (sep, outer) => (
      <div className="flex flex-col gap-1.5">
        <p>
          Separate multiple tag slugs with either{" "}
          <code className="rounded bg-bunker-400/30 px-1">,</code> or{" "}
          <code className="rounded bg-bunker-400/30 px-1">;</code> — whichever is <em>not</em> your
          CSV&apos;s column delimiter.
        </p>
        <p>
          Detected column delimiter:{" "}
          <code className="rounded bg-bunker-400/30 px-1">{formatDelimiter(outer)}</code>, so use{" "}
          <code className="rounded bg-bunker-400/30 px-1">{sep}</code> (e.g.{" "}
          <code className="rounded bg-bunker-400/30 px-1">prod{sep}api</code>).
        </p>
        <p>Missing tags are auto-created if you have permission.</p>
      </div>
    )
  },
  {
    mapKey: "metadata",
    label: "Metadata",
    icon: <CodeXmlIcon />,
    hint: (sep, outer) => (
      <div className="flex flex-col gap-1.5">
        <p>
          Provide <code className="rounded bg-bunker-400/30 px-1">key=value</code> pairs separated
          by either <code className="rounded bg-bunker-400/30 px-1">,</code> or{" "}
          <code className="rounded bg-bunker-400/30 px-1">;</code> — whichever is <em>not</em> your
          CSV&apos;s column delimiter.
        </p>
        <p>
          Detected column delimiter:{" "}
          <code className="rounded bg-bunker-400/30 px-1">{formatDelimiter(outer)}</code>, so use{" "}
          <code className="rounded bg-bunker-400/30 px-1">{sep}</code> (e.g.{" "}
          <code className="rounded bg-bunker-400/30 px-1">owner=team-a{sep}tier=p0</code>).
        </p>
      </div>
    )
  },
  {
    mapKey: "skipMultilineEncoding",
    label: "Multi-line Encoding",
    icon: <WrapTextIcon />,
    hint: () => (
      <>
        Truthy cells (<code className="rounded bg-bunker-400/30 px-1">true</code>,{" "}
        <code className="rounded bg-bunker-400/30 px-1">1</code>,{" "}
        <code className="rounded bg-bunker-400/30 px-1">yes</code>) enable multi-line encoding;
        anything else leaves it disabled.
      </>
    )
  }
];

const MatrixImportModalTableRow = ({
  importSecretMatrixMap,
  setImportSecretMatrixMap,
  headers,
  mapKey,
  label,
  icon,
  hint
}: {
  importSecretMatrixMap: SecretMatrixMap;
  setImportSecretMatrixMap: Dispatch<SetStateAction<SecretMatrixMap>>;
  headers: string[];
  mapKey: MapKey;
  label: string;
  icon: ReactNode;
  hint?: ReactNode;
}) => {
  return (
    <tr>
      <td className="w-full py-2">
        <Select
          value={importSecretMatrixMap[mapKey]?.toString() || (null as unknown as string)}
          onValueChange={(v) =>
            setImportSecretMatrixMap((ism) => ({
              ...ism,
              [mapKey]: v ? parseInt(v, 10) : null
            }))
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select an option..." />
          </SelectTrigger>
          <SelectContent position="popper" className="max-w-none">
            {mapKey !== "key" && <SelectItem value={null as unknown as string}>None</SelectItem>}
            {headers.map((header, col) => (
              <SelectItem value={col.toString()} key={`${mapKey}-${header}`}>
                {header}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="pr-5 pl-5 whitespace-nowrap">
        <div className="flex items-center justify-center">
          <ArrowRightIcon className="size-5 text-accent" />
        </div>
      </td>
      <td className="whitespace-nowrap">
        <div className="flex h-full items-center justify-center gap-1.5">
          <Badge className="flex-1 justify-center" variant="neutral">
            {icon}
            {label}
          </Badge>
          {hint && (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <span className="flex size-4 shrink-0 items-center justify-center text-muted">
                  <InfoIcon className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{hint}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </td>
    </tr>
  );
};

type ContentProps = {
  headers: string[];
  matrix: string[][];
  delimiter: CsvDelimiter;
  onParsedSecrets: (env: TParsedEnv) => void;
  onClose: () => void;
};

const CsvColumnMapContent = ({
  headers,
  matrix,
  delimiter,
  onParsedSecrets,
  onClose
}: ContentProps) => {
  const [importSecretMatrixMap, setImportSecretMatrixMap] = useState<SecretMatrixMap>(() =>
    buildInitialMatrixMap(headers)
  );

  const innerSeparator = pickInnerSeparator(delimiter);

  const handleImport = () => {
    if (!matrix.length) {
      createNotification({
        text: "Invalid secret matrix.",
        type: "error"
      });
      return;
    }

    const env: TParsedEnv = {};
    let malformedMetadataRows = 0;

    matrix.forEach((row) => {
      const key = row[importSecretMatrixMap.key];
      if (!key) return;

      const entry: TParsedEnv[string] = {
        value: importSecretMatrixMap.value !== null ? row[importSecretMatrixMap.value] || "" : "",
        comments:
          importSecretMatrixMap.comment !== null ? [row[importSecretMatrixMap.comment] || ""] : []
      };

      if (importSecretMatrixMap.tags !== null) {
        const tagSlugs = parseTagCell(row[importSecretMatrixMap.tags] || "", innerSeparator);
        if (tagSlugs.length) entry.tagSlugs = tagSlugs;
      }

      if (importSecretMatrixMap.metadata !== null) {
        const { pairs, malformed } = parseMetadataCell(
          row[importSecretMatrixMap.metadata] || "",
          innerSeparator
        );
        if (malformed) malformedMetadataRows += 1;
        if (pairs.length) entry.secretMetadata = pairs;
      }

      if (importSecretMatrixMap.skipMultilineEncoding !== null) {
        const raw = row[importSecretMatrixMap.skipMultilineEncoding];
        if (raw?.trim()) entry.skipMultilineEncoding = parseBooleanCell(raw);
      }

      env[key] = entry;
    });

    if (malformedMetadataRows > 0) {
      createNotification({
        type: "warning",
        text: `Skipped malformed metadata in ${malformedMetadataRows} row${malformedMetadataRows > 1 ? "s" : ""}. Expected format: key=value${innerSeparator}key=value`
      });
    }

    setImportSecretMatrixMap(buildInitialMatrixMap(headers));
    onClose();
    onParsedSecrets(env);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import Column Mapping</DialogTitle>
        <p className="text-sm text-accent">
          Map your data columns to different parts of the secret.
        </p>
      </DialogHeader>
      <div className="w-full overflow-hidden">
        <table className="w-full table-auto">
          <thead>
            <tr className="text-left">
              <th>
                <FormLabel tooltipClassName="max-w-sm" label="Import Column" />
              </th>
              <th />
              <th className="whitespace-nowrap">
                <FormLabel label="Resulting Import" />
              </th>
            </tr>
          </thead>
          <tbody>
            {MATRIX_ROWS.map((row) => (
              <MatrixImportModalTableRow
                key={row.mapKey}
                importSecretMatrixMap={importSecretMatrixMap}
                setImportSecretMatrixMap={setImportSecretMatrixMap}
                headers={headers}
                mapKey={row.mapKey}
                label={row.label}
                icon={row.icon}
                hint={row.hint?.(innerSeparator, delimiter)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="project" onClick={handleImport}>
          Confirm Mapping
        </Button>
      </DialogFooter>
    </>
  );
};

export const CsvColumnMapDialog = ({
  isOpen,
  onOpenChange,
  headers,
  matrix,
  delimiter,
  onParsedSecrets
}: Props) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <CsvColumnMapContent
          headers={headers}
          matrix={matrix}
          delimiter={delimiter}
          onParsedSecrets={onParsedSecrets}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
