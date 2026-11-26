import { type ReactNode, type Ref, useRef, useState } from "react";
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
import { Icon, type IconSource } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@infisical/cipher/ui/popover";
import { TableCell, TableRow } from "@infisical/cipher/ui/table";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import type { LinkOptions } from "@tanstack/react-router";
import { ClipboardPasteIcon, FingerprintIcon, ImportIcon, ListPlusIcon } from "lucide-react";

import { parsePastedEnv } from "@app/components/utilities/parseSecrets";

import { copyText } from "../../../clipboard";
import { ProviderIcon } from "../../../components/provider-icon";
import { v4Path } from "../../../links";
import { withoutDefaults } from "../../search-defaults";
import { useRequestBreadth } from "../bridge/scopes";
import type { ResourceKind, Scope, Secret } from "../secrets-model";
import { type UnsavedChange, useHeldDraft, useUnsavedEdit } from "./batch/unsaved-edits";
import {
  type ExternalImportSource,
  externalImportSources
} from "./external-import/external-import";
import { KindIcon } from "./overview-cells";
import { CommentForm, MetadataForm, TagForm } from "./row-actions/annotations";
import { ReferenceEditor } from "./secret-references";
import { AnnotateMenu, Annotations } from "./secret-row";

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
            <Icon name="funnel" size="var(--cipher-size-icon-small)" />
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
  copyBlock,
  onAdd,
  onUpload,
  onCopySecrets,
  onAddSync,
  onAddProxiedService,
  trigger,
  importSources = [],
  onImportFrom
}: {
  writeBlock?: string;
  accessBlocks?: AddNewBlocks;
  single: boolean;
  copyBlock?: string;
  onAdd: (kind: ResourceKind) => void;
  onUpload: () => void;
  onCopySecrets: () => void;
  onAddSync: () => void;
  onAddProxiedService: () => void;
  trigger?: ReactNode;
  importSources?: ExternalImportSource[];
  onImportFrom?: (source: ExternalImportSource) => void;
}) {
  const blockOf = (kind: ResourceKind, singleReason?: string) => {
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
        {trigger ?? (
          <Button layout="trigger" variant="accent">
            Add new
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={trigger ? "start" : "end"}>
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
        <DropdownMenuItem onSelect={onAddProxiedService}>
          <KindIcon kind="proxy" />
          Add proxied service
        </DropdownMenuItem>
        {item("honey", "Add honey token", <Icon name="honey" />)}
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
            {importSources.length > 0 && <DropdownMenuSeparator />}
            {importSources.map((source) => {
              const { label, name, icon } = externalImportSources[source];
              const reason =
                writeBlock ??
                accessBlocks.secret ??
                (single ? undefined : `Select a single environment to import from ${name}`);
              return (
                <DropdownMenuItem
                  key={source}
                  disabled={Boolean(reason)}
                  description={reason}
                  onSelect={() => onImportFrom?.(source)}
                >
                  <ProviderIcon icon={icon} alt="" data-menu-icon="" />
                  {label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const OVERVIEW_ROUTE = v4Path(
  "/organizations/$orgId/projects/secret-management/$projectId/overview"
);

export function FolderBreadcrumbBar({
  path,
  actions,
  manageAccessBlock,
  onManageAccess,
  report
}: {
  path: string;
  actions?: ReactNode;
  manageAccessBlock?: string;
  onManageAccess: () => void;
  report: (message: string, tone: "ok" | "bad") => void;
}) {
  const segments = path.split("/").filter(Boolean);
  const folderLink = (secretPath: string): LinkOptions => ({
    from: OVERVIEW_ROUTE,
    to: ".",
    search: (previous) =>
      withoutDefaults(
        { ...previous, secretPath, search: "" },
        { secretPath: "/", search: "", environments: [] }
      )
  });
  const folderMenu = (
    <>
      <DropdownMenuItem
        onSelect={async () => {
          if (await copyText(path, "Failed to copy folder path to clipboard.")) {
            report("Folder path copied to clipboard.", "ok");
          }
        }}
      >
        <Icon name="copy" />
        Copy path
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={Boolean(manageAccessBlock)}
        description={manageAccessBlock}
        onSelect={onManageAccess}
      >
        <Icon name="users" />
        Manage access
      </DropdownMenuItem>
    </>
  );
  return (
    <div className={styles.pathBar}>
      <Breadcrumb
        aria-label="Folder path"
        className={styles.crumbs}
        trailingDivider
        items={[
          {
            label: <Icon name="home" label="Root folder" />,
            link: segments.length ? folderLink("/") : undefined,
            menu: segments.length ? undefined : folderMenu
          },
          ...segments.map((segment, index) => {
            const current = index === segments.length - 1;
            return {
              label: segment,
              link: current ? undefined : folderLink(`/${segments.slice(0, index + 1).join("/")}`),
              menu: current ? folderMenu : undefined
            };
          })
        ]}
      />
      {actions && <span className={styles.pathActions}>{actions}</span>}
    </div>
  );
}

type HeaderEnvironment = { value: string; label: string };

export function EnvironmentAction({
  label,
  icon,
  environments,
  disabledReason,
  blockOf,
  onSelect
}: {
  label: string;
  icon: IconSource;
  environments: HeaderEnvironment[];
  disabledReason?: string;
  blockOf?: (environment: string) => string | undefined;
  onSelect: (environment: HeaderEnvironment) => void;
}) {
  const reason =
    disabledReason ?? (environments.length === 1 ? blockOf?.(environments[0].value) : undefined);
  if (reason)
    return (
      <Button variant="ghost" icon={icon} iconOnly disabledReason={reason}>
        {label}
      </Button>
    );
  if (environments.length === 1)
    return (
      <Tooltip content={label}>
        <Button variant="ghost" icon={icon} iconOnly onClick={() => onSelect(environments[0])}>
          {label}
        </Button>
      </Tooltip>
    );
  return (
    <DropdownMenu>
      <Tooltip content={label}>
        <span className={styles.actionSlot}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" icon={icon} iconOnly>
              {label}
            </Button>
          </DropdownMenuTrigger>
        </span>
      </Tooltip>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Environment</DropdownMenuLabel>
        {environments.map((environment) => {
          const block = blockOf?.(environment.value);
          return (
            <DropdownMenuItem
              key={environment.value}
              disabled={Boolean(block)}
              description={block}
              onSelect={() => onSelect(environment)}
            >
              {environment.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type QuickAddAnnotations = Pick<Secret, "comment" | "tags" | "metadata">;
type QuickAddAnnotation = "comment" | "tags" | "metadata";
const noAnnotations: QuickAddAnnotations = { comment: "", tags: [], metadata: [] };
const validName = /^[A-Za-z_][A-Za-z0-9_]*$/;

function QuickAddValue({
  ref,
  scope,
  multiple,
  readOnly,
  value,
  onChange,
  onSave,
  onReset
}: {
  ref: Ref<HTMLTextAreaElement & HTMLInputElement>;
  scope: Scope;
  multiple: boolean;
  readOnly: boolean;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  useRequestBreadth(editing);
  return (
    <ReferenceEditor
      ref={ref}
      multiline
      masked
      value={value}
      scope={scope}
      onValueChange={onChange}
      onKeyDown={(event) => {
        if (readOnly) return;
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onSave();
        }
        if (event.key === "Escape") onReset();
      }}
    >
      {(control) => (
        <Textarea
          {...control}
          onFocusCapture={() => setEditing(true)}
          onBlurCapture={() => setEditing(false)}
          readOnly={readOnly}
          rows={1}
          className={styles.inlineInput}
          aria-label="New secret value"
          placeholder={multiple ? "Add a secret value (applies to all)" : "Add a secret value"}
          autoComplete="off"
          spellCheck={false}
        />
      )}
    </ReferenceEditor>
  );
}

export function QuickAddRow({
  scope,
  multiple,
  environments,
  colSpan,
  existing,
  tagOptions,
  tagsBlock,
  canCreateTags,
  onCreate,
  onQueue,
  onPasteSecrets,
  typeMenu
}: {
  scope: Scope;
  multiple: boolean;
  environments: string[];
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
  typeMenu: ReactNode;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [annotations, setAnnotations] = useState(noAnnotations);
  const [overlay, setOverlay] = useState<QuickAddAnnotation>();
  const [saving, setSaving] = useState(false);
  const valueRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const annotating = useRef(false);
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
  const [draftPath, setDraftPath] = useState(scope.path);
  if (draftPath !== scope.path) {
    setDraftPath(scope.path);
    reset();
  }
  const name = key.trim();
  const pendingChanges = (): UnsavedChange[] =>
    environments.map((environment) => ({
      environment,
      secretPath: scope.path,
      secretKey: name,
      secretValue: value,
      originalValue: "",
      isCreate: true,
      annotations
    }));
  const holdDrafts = useHeldDraft("quick-add", (draft) => {
    if (draft[0]?.secretPath !== scope.path) return;
    if (
      draft.length !== environments.length ||
      draft.some(({ environment }) => !environments.includes(environment))
    ) {
      holdDrafts(draft);
      return;
    }
    setKey(draft[0].secretKey);
    setValue(draft[0].secretValue);
    setAnnotations(draft[0].annotations ?? noAnnotations);
  });
  const { committing, release } = useUnsavedEdit(
    "quick-add",
    multiple && validName.test(name) && !existing.includes(name) && !saving,
    {
      getChanges: pendingChanges,
      settle: (committed) => {
        release();
        holdDrafts(
          pendingChanges().filter(
            (change) => !committed.some(({ environment }) => environment === change.environment)
          )
        );
        reset();
      },
      discard: () => {
        release();
        reset();
      }
    }
  );
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
    if (!name) {
      setError("Secret name is required");
      return;
    }
    if (!validName.test(name)) {
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
      className={`${styles.row} ${styles.quickAdd}`}
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
          {dirty ? (
            <Button
              variant="ghost"
              size="icon-row"
              iconOnly
              icon="plus"
              disabledReason="Finish or clear this secret first"
            >
              Add another resource type
            </Button>
          ) : (
            typeMenu
          )}
        </span>
      </TableCell>
      <TableCell pin="start" pinOffset="var(--cipher-size-row)" className={styles.nameCell}>
        <div className={styles.nameLine}>
          <Input
            ref={keyRef}
            className={styles.inlineInput}
            aria-label="New secret name"
            placeholder="Add a secret name or paste a .env"
            autoComplete="off"
            spellCheck={false}
            value={key}
            readOnly={committing}
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
              <PopoverAnchor asChild>
                <AnnotateMenu
                  revealed
                  label="new secret"
                  annotations={annotations}
                  tagsBlock={tagsBlock}
                  reminderBlock="Create the secret to add a reminder"
                  onOpenChange={(next) => {
                    if (!next) return;
                    annotating.current = true;
                    resume.current =
                      document.activeElement === valueRef.current
                        ? valueRef.current
                        : keyRef.current;
                  }}
                  onChoose={(kind) => {
                    if (kind && kind !== "reminder") setOverlay(kind);
                    else finishAnnotating();
                  }}
                />
              </PopoverAnchor>
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
          <QuickAddValue
            ref={valueRef}
            scope={scope}
            multiple={multiple}
            readOnly={committing}
            value={value}
            onChange={setValue}
            onSave={save}
            onReset={reset}
          />
          {dirty && (
            <span className={styles.quickActions}>
              <Button variant="ghost" size="xs" disabled={committing} onClick={reset}>
                Undo
              </Button>
              <Button size="xs" loading={saving} disabled={committing} onClick={() => save()}>
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
