import { type ReactNode, useRef, useState } from "react";
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
import { Breadcrumb } from "@app/components/v4/ui/breadcrumb";
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

import { copyText, KindIcon, NOT_PORTED } from "./cells";
import { filterKinds, type ResourceKind } from "./model";

import styles from "./overview.module.css";

const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const ResourceFilterMenu = ({
  types,
  onToggleType,
  tags,
  selectedTags,
  onToggleTag,
  onClearTags
}: {
  types: ResourceKind[];
  onToggleType: (kind: ResourceKind) => void;
  tags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
}) => {
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
};

export const ExportButton = ({ disabledReason }: { disabledReason: string }) => (
  <Tooltip content={disabledReason}>
    <span className={styles.actionSlot}>
      <Button variant="outline" icon="download" iconOnly aria-label="Export secrets" disabled>
        Export secrets
      </Button>
    </span>
  </Tooltip>
);

export const AddNewMenu = ({
  writeBlock,
  onAdd
}: {
  writeBlock?: string;
  onAdd: (kind: "secret" | "folder") => void;
}) => {
  const later = (label: string, icon: ReactNode) => (
    <DropdownMenuItem disabled description={writeBlock ?? NOT_PORTED}>
      {icon}
      {label}
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="accent" iconRight="chev-down">
          Add new
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Basic</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={Boolean(writeBlock)}
          description={writeBlock}
          onSelect={() => onAdd("secret")}
        >
          <KindIcon kind="secret" />
          New secret
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={Boolean(writeBlock)}
          description={writeBlock}
          onSelect={() => onAdd("folder")}
        >
          <KindIcon kind="folder" />
          New folder
        </DropdownMenuItem>
        {later("Upload secrets", <Icon name="upload" />)}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Advanced</DropdownMenuLabel>
        {later("Import secrets", <Icon icon={ImportIcon} />)}
        {later("Add dynamic secret", <Icon icon={FingerprintIcon} />)}
        {later("Add secret rotation", <Icon name="sync" />)}
        {later("Add proxied service", <Icon icon={ChevronsLeftRightEllipsisIcon} />)}
        {later("Add honey token", <Icon icon={HexagonIcon} />)}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Icon icon={ListPlusIcon} />
            More
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {later("Copy secrets", <Icon icon={ClipboardPasteIcon} />)}
            {later("New secret sync", <Icon name="sync" />)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const FolderBreadcrumbBar = ({
  path,
  single,
  onNavigate,
  report
}: {
  path: string;
  single: boolean;
  onNavigate: (path: string) => void;
  report: (message: string) => void;
}) => {
  const segments = path.split("/").filter(Boolean);
  return (
    <div className={styles.pathBar}>
      <span className={styles.crumbs}>
        <Breadcrumb
          aria-label="Folder path"
          items={[
            {
              label: <Icon name="home" label="Root folder" />,
              onNavigate: segments.length ? () => onNavigate("/") : undefined
            },
            ...segments.map((segment, index) => ({
              label: segment,
              onNavigate:
                index < segments.length - 1
                  ? () => onNavigate(`/${segments.slice(0, index + 1).join("/")}`)
                  : undefined
            }))
          ]}
        />
      </span>
      <span className={styles.pathActions}>
        <Tooltip content="Copy path">
          <span className={styles.actionSlot}>
            <Button
              variant="ghost"
              size="icon-xs"
              icon="copy"
              iconOnly
              onClick={() =>
                copyText(
                  path,
                  "Folder path copied to clipboard.",
                  "Failed to copy folder path to clipboard.",
                  report
                )
              }
            >
              Copy path
            </Button>
          </span>
        </Tooltip>
        {single && (
          <Tooltip content={NOT_PORTED}>
            <span className={styles.actionSlot}>
              <Button variant="ghost" size="xs" icon="user" disabled>
                Manage access
              </Button>
            </span>
          </Tooltip>
        )}
      </span>
    </div>
  );
};

const parseLine = (text: string) => {
  const line = text.trim();
  const separator = line.indexOf("=");
  if (separator <= 0 || line.includes("\n")) return undefined;
  const key = line.slice(0, separator).trim();
  const value = line
    .slice(separator + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2");
  return SECRET_NAME.test(key) ? { key, value } : undefined;
};

export const QuickAddRow = ({
  multiple,
  colSpan,
  existing,
  onCreate
}: {
  multiple: boolean;
  colSpan: number;
  existing: string[];
  onCreate: (key: string, value: string) => Promise<unknown>;
}) => {
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
  const save = async () => {
    const name = key.trim();
    if (!name) {
      setError("Secret name is required");
      return;
    }
    if (!SECRET_NAME.test(name)) {
      setError("Use letters, numbers and underscores, starting with a letter or underscore");
      return;
    }
    if (existing.includes(name)) {
      setError("A secret with this name already exists");
      return;
    }
    await onCreate(name, value);
    reset();
  };
  return (
    <TableRow className={styles.quickAdd}>
      <TableCell className={styles.iconCell}>
        <span className={styles.iconSlot}>
          <Tooltip content={NOT_PORTED}>
            <span className={styles.actionSlot}>
              <Button variant="ghost" size="icon-row" iconOnly icon="plus" disabled>
                Add another resource type
              </Button>
            </span>
          </Tooltip>
        </span>
      </TableCell>
      <TableCell className={styles.nameCell}>
        <Input
          className={styles.inlineInput}
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
          onPaste={(event) => {
            const parsed = parseLine(event.clipboardData.getData("text"));
            if (!parsed || key) return;
            event.preventDefault();
            setKey(parsed.key);
            setValue(parsed.value);
            setError("");
            setTimeout(() => valueRef.current?.focus(), 0);
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
            mono
            className={styles.inlineInput}
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
};

const countOrder: ResourceKind[] = [
  "import",
  "folder",
  "dynamic",
  "rotation",
  "honey",
  "proxy",
  "secret"
];

export const ResourceCount = ({ counts }: { counts: Partial<Record<ResourceKind, number>> }) => (
  <span className={styles.resourceCount}>
    {countOrder
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
