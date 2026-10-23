import { useRef, useState } from "react";
import {
  ChevronsLeftRightEllipsisIcon,
  ClipboardPasteIcon,
  FilterIcon,
  FingerprintIcon,
  HexagonIcon,
  ImportIcon,
  ListPlusIcon
} from "lucide-react";

import { Count } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { TableCell, TableRow } from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import type { ResourceKind } from "../secrets-model";
import { KindIcon, NEXT_PHASE } from "./overview-cells";

import styles from "./overview.module.css";

export const filterKinds: { value: ResourceKind; label: string }[] = [
  { value: "secret", label: "Secrets" },
  { value: "folder", label: "Folders" },
  { value: "dynamic", label: "Dynamic secrets" },
  { value: "rotation", label: "Secret rotations" },
  { value: "import", label: "Secret imports" },
  { value: "honey", label: "Honey tokens" },
  { value: "proxy", label: "Proxied services" }
];

export function ResourceFilterMenu({
  types,
  onToggleType,
  tags,
  selectedTags,
  onToggleTag,
  onClearTags
}: {
  types: string[];
  onToggleType: (kind: ResourceKind) => void;
  tags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
}) {
  const active = types.length + selectedTags.length;
  return (
    <DropdownMenu>
      <Tooltip content="Filter resources">
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label="Filter resources">
            <Icon icon={FilterIcon} />
            {active > 0 && <Count tone="ink">{active}</Count>}
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Filter by resource</DropdownMenuLabel>
        {filterKinds.map((kind) => (
          <DropdownMenuCheckboxItem
            key={kind.value}
            checked={types.includes(kind.value)}
            onCheckedChange={() => onToggleType(kind.value)}
          >
            <KindIcon kind={kind.value} />
            {kind.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Tags</DropdownMenuLabel>
        {tags.length === 0 && (
          <DropdownMenuItem disabled description="No tags in this project">
            No tags
          </DropdownMenuItem>
        )}
        {tags.map((tag) => (
          <DropdownMenuCheckboxItem
            key={tag}
            checked={selectedTags.includes(tag)}
            onCheckedChange={() => onToggleTag(tag)}
          >
            {tag}
          </DropdownMenuCheckboxItem>
        ))}
        {tags.length > 0 && (
          <DropdownMenuItem
            disabled={!selectedTags.length}
            description={selectedTags.length ? undefined : "No tag filters set"}
            onSelect={onClearTags}
          >
            <Icon name="x" />
            Clear tag filters
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ExportMenu({
  disabledReason,
  secretCount,
  onExport
}: {
  disabledReason?: string;
  secretCount: number;
  onExport: (action: "clipboard" | "download") => void;
}) {
  return (
    <DropdownMenu>
      <Tooltip content={disabledReason ?? "Export secrets"}>
        <span className={styles.actionSlot}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              icon="download"
              iconOnly
              aria-label="Export secrets"
              disabled={Boolean(disabledReason)}
            >
              Export secrets
            </Button>
          </DropdownMenuTrigger>
        </span>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {secretCount} {secretCount === 1 ? "secret" : "secrets"}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onExport("clipboard")}>
          <Icon name="copy" />
          Copy to clipboard
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport("download")}>
          <Icon name="download" />
          Download as .env
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AddNewMenu({
  writeBlock,
  single,
  onNewSecret,
  onNewFolder
}: {
  writeBlock?: string;
  single: boolean;
  onNewSecret: () => void;
  onNewFolder: () => void;
}) {
  const singleOnly = single ? NEXT_PHASE : "Select a single environment first";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button iconRight="chev-down">Add new</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Basic</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={Boolean(writeBlock)}
          description={writeBlock}
          onSelect={onNewSecret}
        >
          <KindIcon kind="secret" />
          New secret
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={Boolean(writeBlock)}
          description={writeBlock}
          onSelect={onNewFolder}
        >
          <KindIcon kind="folder" />
          New folder
        </DropdownMenuItem>
        <DropdownMenuItem disabled description={NEXT_PHASE}>
          <Icon name="upload" />
          Upload secrets
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Advanced</DropdownMenuLabel>
        <DropdownMenuItem disabled description={singleOnly}>
          <Icon icon={ImportIcon} />
          Import secrets
        </DropdownMenuItem>
        <DropdownMenuItem disabled description={NEXT_PHASE}>
          <Icon icon={FingerprintIcon} />
          Add dynamic secret
        </DropdownMenuItem>
        <DropdownMenuItem disabled description={NEXT_PHASE}>
          <Icon name="sync" />
          Add secret rotation
        </DropdownMenuItem>
        <DropdownMenuItem disabled description={singleOnly}>
          <Icon icon={ChevronsLeftRightEllipsisIcon} />
          Add proxied service
        </DropdownMenuItem>
        <DropdownMenuItem disabled description={NEXT_PHASE}>
          <Icon icon={HexagonIcon} />
          Add honey token
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Icon icon={ListPlusIcon} />
            More
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem disabled description={NEXT_PHASE}>
              <Icon icon={ClipboardPasteIcon} />
              Copy secrets
            </DropdownMenuItem>
            <DropdownMenuItem disabled description={singleOnly}>
              <Icon name="sync" />
              New secret sync
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FolderBreadcrumbBar({
  path,
  single,
  onNavigate,
  report
}: {
  path: string;
  single: boolean;
  onNavigate: (path: string) => void;
  report: (message: string) => void;
}) {
  const segments = path.split("/").filter(Boolean);
  return (
    <div className={styles.pathBar}>
      <nav aria-label="Folder path" className={styles.crumbs}>
        <Button
          variant="ghost"
          size="icon-xs"
          iconOnly
          icon="home"
          aria-current={segments.length ? undefined : "page"}
          onClick={() => onNavigate("/")}
        >
          Root folder
        </Button>
        {!segments.length && <span className={styles.crumbSlash}>/</span>}
        {segments.map((segment, index) => (
          <span key={`${segment}-${index + 1}`} className={styles.crumb}>
            <span className={styles.crumbSlash}>/</span>
            {index < segments.length - 1 ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onNavigate(`/${segments.slice(0, index + 1).join("/")}`)}
              >
                {segment}
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="xs" aria-current="page" iconRight="chev-down">
                    {segment}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onSelect={async () => {
                      try {
                        await navigator.clipboard.writeText(path);
                        report("Folder path copied to clipboard.");
                      } catch {
                        report("Failed to copy folder path to clipboard.");
                      }
                    }}
                  >
                    <Icon name="copy" />
                    Copy path
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </span>
        ))}
      </nav>
      {single && (
        <Tooltip content={NEXT_PHASE}>
          <span className={styles.actionSlot}>
            <Button variant="ghost" size="xs" icon="user" disabled>
              Manage access
            </Button>
          </span>
        </Tooltip>
      )}
    </div>
  );
}

export function QuickAddRow({
  multiple,
  colSpan,
  existing,
  onCreate
}: {
  multiple: boolean;
  colSpan: number;
  existing: string[];
  onCreate: (key: string, value: string) => void;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const valueRef = useRef<HTMLInputElement>(null);
  const dirty = Boolean(key || value);
  const reset = () => {
    setKey("");
    setValue("");
    setError("");
  };
  const save = () => {
    const name = key.trim();
    if (!name) {
      setError("Secret name is required");
      return;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      setError("Use letters, numbers and underscores, starting with a letter or underscore");
      return;
    }
    if (existing.includes(name)) {
      setError("A secret with this name already exists");
      return;
    }
    onCreate(name, value);
    reset();
  };
  return (
    <TableRow className={styles.quickAdd}>
      <TableCell className={styles.iconCell}>
        <span className={styles.iconSlot}>
          <Tooltip content={NEXT_PHASE}>
            <span className={styles.actionSlot}>
              <Button variant="ghost" size="icon-xs" iconOnly icon="plus" disabled>
                Add another resource type
              </Button>
            </span>
          </Tooltip>
        </span>
      </TableCell>
      <TableCell className={styles.nameCell}>
        <Input
          aria-label="New secret name"
          placeholder="Add a secret name"
          autoComplete="off"
          spellCheck={false}
          value={key}
          aria-invalid={Boolean(error) || undefined}
          title={error || undefined}
          onChange={(event) => {
            setKey(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            valueRef.current?.focus();
          }}
        />
      </TableCell>
      <TableCell colSpan={colSpan} className={styles.valueCell}>
        <div className={styles.nameLine}>
          <Input
            ref={valueRef}
            aria-label="New secret value"
            placeholder={multiple ? "Add a secret value (applies to all)" : "Add a secret value"}
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
              if (event.key === "Escape") reset();
            }}
          />
          {dirty && (
            <span className={styles.quickActions}>
              <Button variant="ghost" size="xs" onClick={reset}>
                Undo
              </Button>
              <Button size="xs" onClick={save}>
                Save
              </Button>
            </span>
          )}
        </div>
        {error && (
          <span role="alert" className={styles.fieldError}>
            {error}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

export function ResourceCount({ counts }: { counts: Partial<Record<ResourceKind, number>> }) {
  const order: ResourceKind[] = [
    "import",
    "folder",
    "dynamic",
    "rotation",
    "honey",
    "proxy",
    "secret"
  ];
  return (
    <span className={styles.resourceCount}>
      {order
        .filter((kind) => counts[kind])
        .map((kind) => (
          <Tooltip
            key={kind}
            content={`Total ${filterKinds
              .find((entry) => entry.value === kind)
              ?.label.toLowerCase()
              .replace(/s$/, "")} count matching filters`}
          >
            <span className={styles.countItem}>
              <KindIcon kind={kind} />
              {counts[kind]}
            </span>
          </Tooltip>
        ))}
    </span>
  );
}
