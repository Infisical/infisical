import { type ReactNode, useRef, useState } from "react";
import { Count } from "@infisical/cipher/ui/badge";
import { Breadcrumb } from "@infisical/cipher/ui/breadcrumb";
import { Button } from "@infisical/cipher/ui/button";
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
} from "@infisical/cipher/ui/dropdown-menu";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@infisical/cipher/ui/popover";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { TableCell, TableRow } from "@infisical/cipher/ui/table";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import {
  BellIcon,
  ClipboardPasteIcon,
  CodeXmlIcon,
  FilterIcon,
  FingerprintIcon,
  HexagonIcon,
  ImportIcon,
  ListPlusIcon,
  MessageSquareIcon,
  PencilLineIcon,
  TagsIcon
} from "lucide-react";

import { parsePastedEnv } from "@app/components/utilities/parseSecrets";

import type { ResourceKind, Secret } from "../secrets-model";
import { KindIcon, NEXT_PHASE } from "./overview-cells";
import { CommentForm, MetadataForm, TagForm } from "./row-actions/annotations";
import { Annotations } from "./secret-row";

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
      {disabledReason ? (
        <Button
          variant="outline"
          icon="download"
          iconOnly
          aria-label="Export secrets"
          disabledReason={disabledReason}
        >
          Export secrets
        </Button>
      ) : (
        <Tooltip content="Export secrets">
          <span className={styles.actionSlot}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" icon="download" iconOnly aria-label="Export secrets">
                Export secrets
              </Button>
            </DropdownMenuTrigger>
          </span>
        </Tooltip>
      )}
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

export type AddNewBlocks = Partial<Record<ResourceKind | "upload" | "copy" | "sync", string>>;

export function AddNewMenu({
  writeBlock,
  accessBlocks = {},
  single,
  available,
  copyBlock,
  onAdd,
  onUpload,
  onCopySecrets,
  onAddSync
}: {
  writeBlock?: string;
  accessBlocks?: AddNewBlocks;
  single: boolean;
  available: Partial<Record<ResourceKind, boolean>>;
  copyBlock?: string;
  onAdd: (kind: ResourceKind) => void;
  onUpload: () => void;
  onCopySecrets: () => void;
  onAddSync: () => void;
}) {
  const blockOf = (kind: ResourceKind, singleReason?: string) => {
    if (!available[kind]) return NEXT_PHASE;
    if (writeBlock) return writeBlock;
    if (accessBlocks[kind]) return accessBlocks[kind];
    return singleReason && !single ? singleReason : undefined;
  };
  const item = (kind: ResourceKind, label: string, icon: ReactNode, singleReason?: string) => {
    const reason = blockOf(kind, singleReason);
    return (
      <DropdownMenuItem
        disabled={Boolean(reason)}
        description={reason}
        onSelect={() => onAdd(kind)}
      >
        {icon}
        {label}
      </DropdownMenuItem>
    );
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button layout="trigger" variant="accent">
          Add new
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Basic</DropdownMenuLabel>
        {item("secret", "New secret", <KindIcon kind="secret" />)}
        {item("folder", "New folder", <KindIcon kind="folder" />)}
        <DropdownMenuItem
          disabled={Boolean(writeBlock ?? accessBlocks.upload)}
          description={writeBlock ?? accessBlocks.upload}
          onSelect={onUpload}
        >
          <Icon name="upload" />
          Upload secrets
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Advanced</DropdownMenuLabel>
        {item(
          "import",
          "Import secrets",
          <Icon icon={ImportIcon} />,
          "Select a single environment to import secrets"
        )}
        {item("dynamic", "Add dynamic secret", <Icon icon={FingerprintIcon} />)}
        {item("rotation", "Add secret rotation", <Icon name="sync" />)}
        {item("honey", "Add honey token", <Icon icon={HexagonIcon} />)}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Icon icon={ListPlusIcon} />
            More
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              disabled={Boolean(accessBlocks.copy ?? copyBlock)}
              description={accessBlocks.copy ?? copyBlock}
              onSelect={onCopySecrets}
            >
              <Icon icon={ClipboardPasteIcon} />
              Copy secrets
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={Boolean(writeBlock ?? accessBlocks.sync) || !single}
              description={
                writeBlock ??
                accessBlocks.sync ??
                (single ? undefined : "Select a single environment to add a secret sync")
              }
              onSelect={onAddSync}
            >
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
  accessBlock,
  actions,
  onManageAccess,
  onNavigate,
  report
}: {
  path: string;
  accessBlock?: string;
  actions?: ReactNode;
  onManageAccess?: () => void;
  onNavigate: (path: string) => void;
  report: (message: string, tone: "ok" | "bad") => void;
}) {
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
        {actions}
        <Tooltip content="Copy path">
          <span className={styles.actionSlot}>
            <Button
              variant="ghost"
              size="icon-xs"
              icon="copy"
              iconOnly
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(path);
                  report("Folder path copied to clipboard.", "ok");
                } catch {
                  report("Failed to copy folder path to clipboard.", "bad");
                }
              }}
            >
              Copy path
            </Button>
          </span>
        </Tooltip>
        {onManageAccess && (
          <Button
            variant="ghost"
            size="xs"
            icon="user"
            disabledReason={accessBlock}
            onClick={onManageAccess}
          >
            Manage access
          </Button>
        )}
      </span>
    </div>
  );
}

export type QuickAddAnnotations = Pick<Secret, "comment" | "tags" | "metadata">;
type QuickAddAnnotation = "comment" | "tags" | "metadata";
const noAnnotations: QuickAddAnnotations = { comment: "", tags: [], metadata: [] };

export function QuickAddRow({
  multiple,
  colSpan,
  existing,
  tagOptions,
  tagsBlock,
  canCreateTags,
  onCreate,
  onQueue,
  onPasteSecrets
}: {
  multiple: boolean;
  colSpan: number;
  existing: string[];
  tagOptions: string[];
  tagsBlock?: string;
  canCreateTags: boolean;
  onCreate: (
    key: string,
    value: string,
    annotations: QuickAddAnnotations,
    onFieldError: (message: string) => void
  ) => Promise<boolean>;
  onQueue?: (key: string, value: string, annotations: QuickAddAnnotations) => void;
  onPasteSecrets: (parsed: ReturnType<typeof parsePastedEnv>) => void;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [annotations, setAnnotations] = useState(noAnnotations);
  const [overlay, setOverlay] = useState<QuickAddAnnotation>();
  const [saving, setSaving] = useState(false);
  const valueRef = useRef<HTMLTextAreaElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const annotating = useRef(false);
  const chosen = useRef<QuickAddAnnotation>(undefined);
  const resume = useRef<HTMLElement | null>(null);
  const annotated = Boolean(
    annotations.comment || annotations.tags.length || annotations.metadata.length
  );
  const dirty = Boolean(key || value || annotated);
  const reset = () => {
    setKey("");
    setValue("");
    setError("");
    setAnnotations(noAnnotations);
  };
  const finishAnnotating = () => {
    setOverlay(undefined);
    (resume.current ?? valueRef.current)?.focus();
    annotating.current = false;
  };
  const annotate = (patch: Partial<QuickAddAnnotations>) => {
    setAnnotations((current) => ({ ...current, ...patch }));
    finishAnnotating();
  };
  const save = (queue = false) => {
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
    if (queue && onQueue) {
      onQueue(name, value, annotations);
      reset();
      return;
    }
    setSaving(true);
    onCreate(name, value, annotations, setError)
      .then((ok) => {
        if (ok) reset();
      })
      .finally(() => setSaving(false));
  };
  return (
    <TableRow
      className={styles.quickAdd}
      focused={Boolean(overlay)}
      onBlurCapture={(event) => {
        if (
          annotating.current ||
          saving ||
          !onQueue ||
          !key.trim() ||
          event.currentTarget.contains(event.relatedTarget as Node)
        )
          return;
        save(true);
      }}
    >
      <TableCell pin="start" selection divider={false}>
        <span className={styles.iconSlot}>
          <Button variant="ghost" size="icon-row" iconOnly icon="plus" disabledReason={NEXT_PHASE}>
            Add another resource type
          </Button>
        </span>
      </TableCell>
      <TableCell pin="start" pinOffset="var(--v4-size-row)" className={styles.nameCell}>
        <div className={styles.nameLine}>
          <Input
            ref={keyRef}
            className={styles.inlineInput}
            aria-label="New secret name"
            placeholder="Add a secret name or paste a .env"
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
              const { selectionStart, selectionEnd, value: current } = event.currentTarget;
              if (key && !(selectionStart === 0 && selectionEnd === current.length)) return;
              const entries = Object.entries(parsePastedEnv(event.clipboardData.getData("text")));
              if (!entries.length) return;
              event.preventDefault();
              if (entries.length > 1) {
                onPasteSecrets(Object.fromEntries(entries));
                return;
              }
              setKey(entries[0][0]);
              setValue(entries[0][1].value);
              setError("");
              setTimeout(() => valueRef.current?.focus(), 0);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              valueRef.current?.focus();
            }}
          />
          <Annotations
            secret={{ name: key.trim(), ...annotations }}
            onOpen={(next) => {
              annotating.current = true;
              resume.current = keyRef.current;
              setOverlay(next);
            }}
          />
          {key.trim() && (
            <Popover
              open={Boolean(overlay)}
              onOpenChange={(next) => {
                if (!next) finishAnnotating();
              }}
            >
              <DropdownMenu
                onOpenChange={(next) => {
                  if (!next) return;
                  annotating.current = true;
                  chosen.current = undefined;
                  resume.current =
                    document.activeElement === valueRef.current ? valueRef.current : keyRef.current;
                }}
              >
                <PopoverAnchor asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-xs" iconOnly tabIndex={-1}>
                      <Icon icon={PencilLineIcon} />
                      <span className="sr-only">Annotate new secret</span>
                    </Button>
                  </DropdownMenuTrigger>
                </PopoverAnchor>
                <DropdownMenuContent
                  align="start"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    if (chosen.current) setOverlay(chosen.current);
                    else finishAnnotating();
                  }}
                >
                  <DropdownMenuLabel>Annotate</DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      chosen.current = "comment";
                    }}
                  >
                    <Icon icon={MessageSquareIcon} />
                    {annotations.comment ? "Edit comment" : "Add comment"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={Boolean(tagsBlock)}
                    description={tagsBlock}
                    onSelect={() => {
                      chosen.current = "tags";
                    }}
                  >
                    <Icon icon={TagsIcon} />
                    {annotations.tags.length ? "Edit tags" : "Add tags"}
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled description="Create the secret to add a reminder">
                    <Icon icon={BellIcon} />
                    Add reminder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      chosen.current = "metadata";
                    }}
                  >
                    <Icon icon={CodeXmlIcon} />
                    {annotations.metadata.length ? "Edit metadata" : "Add metadata"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <PopoverContent
                draggable
                align="start"
                className={
                  overlay === "metadata" ? styles.metadataPopover : styles.annotationPopover
                }
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                {overlay === "comment" && (
                  <CommentForm
                    comment={annotations.comment}
                    canEdit
                    onClose={finishAnnotating}
                    onSave={(comment) => annotate({ comment })}
                  />
                )}
                {overlay === "tags" && (
                  <TagForm
                    tags={annotations.tags}
                    options={tagOptions}
                    canEdit
                    canCreate={canCreateTags}
                    onClose={finishAnnotating}
                    onSave={(tags) => annotate({ tags })}
                  />
                )}
                {overlay === "metadata" && (
                  <MetadataForm
                    metadata={annotations.metadata}
                    canEdit
                    onClose={finishAnnotating}
                    onSave={(metadata) => annotate({ metadata })}
                  />
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </TableCell>
      <TableCell
        pin={multiple ? "viewport" : undefined}
        colSpan={colSpan}
        className={styles.valueCell}
      >
        <div className={styles.nameLine}>
          <SecretInput
            className={styles.inlineInput}
            ref={valueRef}
            aria-label="New secret value"
            placeholder={multiple ? "Add a secret value (applies to all)" : "Add a secret value"}
            value={value}
            onChange={setValue}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
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
              <Button size="xs" loading={saving} onClick={() => save()}>
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
