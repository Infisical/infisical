import {
  type ComponentProps,
  type KeyboardEvent,
  memo,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
  useState
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  RowActions,
  RowContextMenu,
  TableActionsCell,
  TableActionsHead,
  TableRow,
  TableRowIndicators
} from "@infisical/cipher/ui/table";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import {
  BellIcon,
  CodeXmlIcon,
  CopyPlusIcon,
  EditIcon,
  EyeOffIcon,
  ForwardIcon,
  GitBranchIcon,
  ImportIcon,
  MessageSquareIcon,
  PencilLineIcon,
  TagsIcon,
  UsersIcon,
  WorkflowIcon,
  WrapTextIcon
} from "lucide-react";

import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { failed } from "../../../access/toast";
import { copyText } from "../../../clipboard";
import { useV4Adapter } from "../../../data/adapters";
import { useRequestBreadth } from "../bridge/scopes";
import { useValueLoader } from "../bridge/values";
import { valueKey } from "../bridge/view-model";
import {
  readableValue,
  type Resource,
  type Scope,
  type Secret,
  selectionKey
} from "../secrets-model";
import type { PendingType } from "./batch/pending";
import {
  draftKey,
  type UnsavedChange,
  useHeldDraft,
  useUnsavedEdit,
  useUnsavedEditsState
} from "./batch/unsaved-edits";
import { environmentLabel } from "./flows/shared";
import {
  ChildSelectCell,
  ChildSelectHead,
  type EnvironmentStatus,
  ExpandCell,
  type KindOverlay,
  PendingMenuItems,
  ROW_ACTION_SLOTS,
  type RowActionProps,
  type RowContext,
  RowStateBadges,
  SelectCell,
  StatusCell,
  stopRowClick,
  sameRow
} from "./overview-cells";
import { usePlanGates } from "./plan-gates";
import { AccessInsightsSheet } from "./row-actions/access-insights-sheet";
import { CommentForm, MetadataForm, ReminderSheet, TagForm } from "./row-actions/annotations";
import { ConfirmDependentsDialog } from "./row-actions/confirm-dependents-dialog";
import { EditSecretSheet } from "./row-actions/edit-secret-sheet";
import { ReferencesDialog, useDependents } from "./row-actions/references-dialog";
import { RenameSecretDialog } from "./row-actions/rename-secret-dialog";
import { ShareSecretSheet } from "./row-actions/share-secret-sheet";
import type { SecretUpdate } from "./row-actions/types";
import { VersionHistorySheet } from "./row-actions/version-history-sheet";
import { hasReference, ReferenceEditor, ReferenceText, ResolvedValue } from "./secret-references";

import styles from "./overview.module.css";

const mask = "••••••••••••••••";
const overlayOf = (secret: Secret): KindOverlay | undefined => {
  if (secret.managedBy) return "rotation";
  if (secret.honeyToken) return "honey";
  return undefined;
};
export type SecretRowHandlers = {
  onCreateIn: (environment: string, key: string) => void;
  onDelete: (secret: Secret) => void;
  onUpdate: SecretUpdate;
  onCopySecret: (secret: Secret) => void;
  copySecretBlock?: string;
  onNavigate: (environment: string, path: string, key: string) => void;
  onRefresh: () => void;
  importedFrom: (environment: string, key: string) => string | undefined;
  resources: readonly Resource[];
  tagOptions: string[];
  autoCapitalize: boolean;
  secretNames: string[];
  secretNameTaken: (name: string) => Promise<boolean>;
  onRename: (
    secrets: Secret[],
    name: string,
    onFieldError: (message: string) => void
  ) => Promise<boolean>;
};
type Overlay =
  | "edit"
  | "comment"
  | "tags"
  | "metadata"
  | "reminder"
  | "history"
  | "references"
  | "access"
  | "share"
  | "resolved";
const popovers: Overlay[] = ["comment", "tags", "metadata", "resolved"];
const popoverClass: Partial<Record<Overlay, string>> = {
  metadata: styles.metadataPopover,
  resolved: styles.resolvedPopover
};

const copy = async (
  value: string,
  done: string,
  failure: string,
  report: (message: string, tone: "ok" | "bad") => void
) => {
  if (await copyText(value, failure)) report(done, "ok");
};

function SecretValue({ secret, visible }: { secret?: Secret; visible: boolean }) {
  const [focused, setFocused] = useState(false);
  const loader = useValueLoader();
  const shown = visible || focused;
  const loading = secret?.value.status === "loading";
  useEffect(() => {
    if (secret && shown && loading) loader.request([secret]);
  }, [shown, loading, secret?.id, secret?.version]);
  if (!secret) return <span className={styles.subtle}>Not set in this environment</span>;
  const value = loading ? mask : readableValue(secret);
  if (value === undefined)
    return (
      <span className={styles.nameLine}>
        <Tooltip content="You do not have access to view the current value.">
          <span className={styles.hint}>
            <Icon icon={EyeOffIcon} label="Value hidden" />
          </span>
        </Tooltip>
        <code className={styles.value}>{mask}</code>
      </span>
    );
  return (
    <span
      className={styles.value}
      role="textbox"
      aria-readonly
      tabIndex={0}
      aria-label={`Value of ${secret.name}, focus to reveal`}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {value === "" && <span className={styles.emptyValue}>Empty</span>}
      {value !== "" && (shown && !loading ? <ReferenceText value={value} scope={secret} /> : mask)}
    </span>
  );
}

type InlineSave = (value: string, onFieldError: (message: string) => void) => Promise<boolean>;

function InlineEditor({
  label,
  scope,
  initial,
  placeholder,
  saveLabel,
  undoLabel,
  dirtyFromStart,
  multiline,
  draft: restored,
  unsaved,
  onSave,
  onCancel,
  idle
}: {
  label: string;
  scope: Scope;
  initial: string;
  placeholder?: string;
  saveLabel: string;
  undoLabel: string;
  dirtyFromStart?: boolean;
  multiline?: boolean;
  draft?: string;
  unsaved?: {
    key: string;
    change: (draft: string) => UnsavedChange;
    settle: (committed: UnsavedChange, draft: string) => void;
  };
  onSave: InlineSave;
  onCancel: () => void;
  idle?: ReactNode;
}) {
  useRequestBreadth(Boolean(multiline));
  const [draft, setDraft] = useState(restored ?? initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const registry = useUnsavedEditsState()?.registry;
  const dirty = dirtyFromStart || draft !== initial;
  const { committing, release } = useUnsavedEdit(unsaved?.key, dirty && !saving, {
    getChanges: () => (unsaved ? [unsaved.change(draft)] : []),
    settle: ([committed]) => {
      if (!unsaved || !committed) return;
      if (committed.secretValue === draft) release();
      unsaved.settle(committed, draft);
    },
    discard: () => {
      release();
      onCancel();
    }
  });
  const cancel = () => {
    release();
    onCancel();
  };
  const save = () => {
    if (saving || committing) return;
    const submitted = unsaved?.change(draft);
    setSaving(true);
    onSave(draft, setError)
      .catch(() => false)
      .then((ok) => {
        if (!ok && submitted && !mounted.current) registry?.holdDrafts([submitted]);
      })
      .finally(() => setSaving(false));
  };
  const control = {
    autoFocus: true,
    readOnly: saving || committing,
    className: styles.inlineInput,
    "aria-invalid": Boolean(error) || undefined,
    "aria-label": label,
    placeholder,
    autoComplete: "off",
    spellCheck: false
  };
  return (
    <div ref={root} className={styles.inlineEdit} data-invalid={error ? "" : undefined}>
      <ReferenceEditor
        value={draft}
        scope={scope}
        multiline={multiline}
        onValueChange={(next) => {
          setDraft(next);
          setError("");
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter" && !event.shiftKey && dirty) {
            event.preventDefault();
            save();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        onBlur={(event) => {
          if (!dirty && !root.current?.contains(event.relatedTarget as Node)) onCancel();
        }}
      >
        {(editor) =>
          multiline ? (
            <Textarea {...editor} {...control} rows={1} />
          ) : (
            <Input {...editor} {...control} />
          )
        }
      </ReferenceEditor>
      {dirty ? (
        <span className={styles.quickActions}>
          <Button variant="ghost" size="xs" disabled={committing} onClick={cancel}>
            {undoLabel}
          </Button>
          <Button size="xs" loading={saving} disabled={committing} onClick={save}>
            {saveLabel}
          </Button>
        </span>
      ) : (
        idle
      )}
      {error && (
        <span role="alert" className={styles.fieldError}>
          {error}
        </span>
      )}
    </div>
  );
}

function Indicators({ secret }: { secret: Secret }) {
  if (!secret.skipMultilineEncoding) return null;
  return (
    <TableRowIndicators>
      <Tooltip content="Multi-line encoding disabled">
        <span className={styles.hint}>
          <Icon icon={WrapTextIcon} label="Multi-line encoding disabled" />
        </span>
      </Tooltip>
    </TableRowIndicators>
  );
}

const pendingSecretActions: Record<PendingType, ProjectPermissionSecretActions> = {
  create: ProjectPermissionSecretActions.Create,
  update: ProjectPermissionSecretActions.Edit,
  delete: ProjectPermissionSecretActions.Delete
};

type Annotation = "comment" | "tags" | "metadata";

export function Annotations({
  secret,
  onOpen
}: {
  secret: Pick<Secret, "name" | "comment" | "tags" | "metadata">;
  onOpen: (overlay: Annotation) => void;
}) {
  const marks = [
    secret.comment && {
      overlay: "comment",
      icon: MessageSquareIcon,
      label: "View comment",
      hint: secret.comment
    },
    secret.tags.length > 0 && {
      overlay: "tags",
      icon: TagsIcon,
      label: "View tags",
      hint: secret.tags.join(", ")
    },
    secret.metadata.length > 0 && {
      overlay: "metadata",
      icon: CodeXmlIcon,
      label: "View metadata",
      hint: `${secret.metadata.length} metadata entr${secret.metadata.length > 1 ? "ies" : "y"}`
    }
  ].filter(Boolean) as {
    overlay: Annotation;
    icon: typeof TagsIcon;
    label: string;
    hint: string;
  }[];
  if (!marks.length) return null;
  return (
    <span className={styles.annotations}>
      {marks.map((mark) => (
        <Tooltip key={mark.overlay} content={mark.hint}>
          <Button
            variant="ghost"
            size="icon-xs"
            iconOnly
            onClick={(event) => {
              event.stopPropagation();
              onOpen(mark.overlay);
            }}
          >
            <Icon icon={mark.icon} size="var(--cipher-size-icon-caption)" />
            <span className="sr-only">{`${mark.label} for ${secret.name}`}</span>
          </Button>
        </Tooltip>
      ))}
    </span>
  );
}

export type AnnotationKind = Annotation | "reminder";

export function AnnotateMenu({
  ref,
  label,
  annotations,
  tagsBlock,
  reminderBlock,
  revealed,
  onOpenChange,
  onChoose,
  ...rest
}: {
  ref?: Ref<HTMLSpanElement>;
  label: string;
  annotations: Pick<Secret, "comment" | "tags" | "metadata"> & { reminder?: unknown };
  tagsBlock?: string;
  reminderBlock?: string;
  revealed?: boolean;
  onOpenChange?: (open: boolean) => void;
  onChoose: (kind: AnnotationKind | undefined) => void;
}) {
  const chosen = useRef<AnnotationKind>(undefined);
  const [open, setOpen] = useState(false);
  return (
    <span
      ref={ref}
      className={styles.annotateSlot}
      data-revealed={revealed || open || undefined}
      {...rest}
    >
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          if (next) chosen.current = undefined;
          setOpen(next);
          onOpenChange?.(next);
        }}
      >
        <Tooltip content="Annotate">
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              iconOnly
              tabIndex={-1}
              onClick={(event) => event.stopPropagation()}
            >
              <Icon icon={PencilLineIcon} />
              <span className="sr-only">{`Annotate ${label}`}</span>
            </Button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent
          align="start"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onChoose(chosen.current);
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
            <Icon name="tag" />
            {annotations.tags.length ? "Edit tags" : "Add tags"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={Boolean(reminderBlock)}
            description={reminderBlock}
            onSelect={() => {
              chosen.current = "reminder";
            }}
          >
            <Icon icon={BellIcon} />
            {annotations.reminder ? "Edit reminder" : "Add reminder"}
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
    </span>
  );
}

// TODO: replace with Cipher's inline editable cell once it ships; Cipher has none yet.
function CellEditor({
  label,
  initial,
  scope,
  multiline,
  placeholder,
  transform,
  validate,
  onCommit,
  onInvalidBlur,
  onDone,
  holdCommit,
  onDraftChange
}: {
  label: string;
  initial: string;
  scope: Scope;
  multiline?: boolean;
  placeholder?: string;
  transform?: (value: string) => string;
  validate?: (value: string) => string | undefined | Promise<string | undefined>;
  onCommit: (value: string) => void;
  onInvalidBlur: (message: string) => void;
  onDone: () => void;
  holdCommit?: (value: string) => boolean;
  onDraftChange?: () => void;
}) {
  useRequestBreadth(Boolean(multiline));
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const attempt = useRef(0);
  const finish = async (blurred: boolean) => {
    const next = multiline ? draft : draft.trim();
    if (next === initial) {
      onDone();
      return;
    }
    attempt.current += 1;
    const { current: started } = attempt;
    const problem = await validate?.(next);
    if (started !== attempt.current) return;
    if (problem && !blurred) {
      setError(problem);
      return;
    }
    if (problem) onInvalidBlur(problem);
    else if (holdCommit?.(next)) return;
    else onCommit(next);
    onDone();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      finish(false);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      attempt.current += 1;
      onDone();
    }
  };
  const change = (value: string) => {
    attempt.current += 1;
    setDraft(transform ? transform(value) : value);
    setError("");
    onDraftChange?.();
  };
  return (
    <div className={styles.inlineEdit} data-invalid={error ? "" : undefined}>
      {multiline ? (
        <ReferenceEditor
          value={draft}
          scope={scope}
          multiline
          onValueChange={change}
          onKeyDown={onKeyDown}
          onBlur={() => finish(true)}
        >
          {(control) => (
            <Textarea
              {...control}
              autoFocus
              rows={1}
              className={styles.inlineInput}
              aria-invalid={Boolean(error) || undefined}
              aria-label={label}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </ReferenceEditor>
      ) : (
        <Input
          autoFocus
          value={draft}
          className={styles.inlineInput}
          aria-invalid={Boolean(error) || undefined}
          aria-label={label}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => change(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => finish(true)}
        />
      )}
      {error && (
        <span role="alert" className={styles.fieldError}>
          {error}
        </span>
      )}
    </div>
  );
}

function DependentsCellEditor({
  secret,
  ...editor
}: ComponentProps<typeof CellEditor> & { secret: Secret }) {
  const { dependents, isPending } = useDependents(secret);
  const [held, setHeld] = useState<string>();
  const { onCommit, onDone } = editor;
  useEffect(() => {
    if (held === undefined || isPending || dependents.length) return;
    onCommit(held);
    onDone();
  }, [held, isPending, dependents.length, onCommit, onDone]);
  return (
    <>
      <CellEditor
        {...editor}
        holdCommit={(value) => {
          if (!isPending && !dependents.length) return false;
          setHeld(value);
          return true;
        }}
        onDraftChange={() => setHeld(undefined)}
      />
      <ConfirmDependentsDialog
        open={held !== undefined && !isPending && dependents.length > 0}
        dependents={dependents}
        onOpenChange={(open) => {
          if (!open) setHeld(undefined);
        }}
        onConfirm={() => {
          if (held === undefined) return;
          editor.onCommit(held);
          editor.onDone();
        }}
      />
    </>
  );
}

// TODO: replace with Cipher's inline editable cell once it ships; Cipher has none yet.
function EditableCell({
  canEdit,
  load,
  editor,
  dependentsOf,
  trailing,
  children,
  ...cell
}: Omit<ComponentProps<typeof TableCell>, "onClick"> & {
  canEdit: boolean;
  load: () => Promise<string | undefined>;
  editor: Omit<ComponentProps<typeof CellEditor>, "initial" | "onDone">;
  dependentsOf?: Secret;
  trailing?: ReactNode;
}) {
  const [initial, setInitial] = useState<string>();
  const begin = async () => {
    if (!canEdit || initial !== undefined) return;
    const loaded = await load();
    if (loaded !== undefined) setInitial(loaded);
  };
  return (
    <TableCell
      {...cell}
      data-editable={canEdit || undefined}
      tabIndex={canEdit && initial === undefined ? 0 : undefined}
      onClick={() => begin()}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== "F2") return;
        event.preventDefault();
        begin();
      }}
    >
      <div className={styles.nameLine}>
        {initial === undefined && children}
        {initial !== undefined && dependentsOf && (
          <DependentsCellEditor
            {...editor}
            secret={dependentsOf}
            initial={initial}
            onDone={() => setInitial(undefined)}
          />
        )}
        {initial !== undefined && !dependentsOf && (
          <CellEditor {...editor} initial={initial} onDone={() => setInitial(undefined)} />
        )}
        {trailing}
      </div>
    </TableCell>
  );
}

const canEditInline = (secret: Secret, ctx: RowContext) => {
  const pendingType = ctx.pending?.[secret.id];
  const denied = ctx.blockFor?.(
    ProjectPermissionSub.Secrets,
    pendingType === "create"
      ? ProjectPermissionSecretActions.Create
      : ProjectPermissionSecretActions.Edit,
    {
      environment: secret.environment,
      secretPath: secret.path,
      secretName: secret.name,
      secretTags: ["*"]
    },
    "edit this secret"
  );
  return (
    !ctx.writeBlock &&
    !denied &&
    !secret.honeyToken &&
    !secret.managedBy &&
    pendingType !== "delete"
  );
};

function SecretActionsRow({
  secret,
  ctx,
  handlers,
  onAddOverride,
  open,
  setOpen,
  row,
  children
}: {
  secret: Secret;
  ctx: RowContext;
  handlers: SecretRowHandlers;
  onAddOverride: () => void;
  open: Overlay | undefined;
  setOpen: (overlay: Overlay | undefined) => void;
  row: ComponentProps<typeof TableRow> & { [key: `data-${string}`]: unknown };
  children: ReactNode;
}) {
  const pending = useRef<() => void>(undefined);
  const [seen, setSeen] = useState<Overlay[]>([]);
  if (open && !seen.includes(open)) setSeen([...seen, open]);
  const loader = useValueLoader();
  const adapter = useV4Adapter("secrets");
  const createReminder = adapter.useCreateReminder(secret.id);
  const deleteReminder = adapter.useDeleteReminder(secret.id);
  const redactVersion = adapter.useRedactSecretVersion();
  useRequestBreadth(open === "references" || open === "edit");
  const value = readableValue(secret);
  const unreadable = secret.value.status === "unreadable";
  const withValue = (run: (loaded: string) => void) => {
    if (value !== undefined) {
      run(value);
      return;
    }
    loader.ensure([secret]).then((values) => {
      const loaded =
        values[valueKey(secret.environment, secret.path, secret.name, false, secret.version)];
      if (typeof loaded === "string") run(loaded);
      else ctx.report(`Could not read ${secret.name}.`, "bad");
    });
  };
  const label = environmentLabel(secret.environment);
  const denied = (
    sub: ProjectPermissionSub,
    action: string,
    fields: Record<string, unknown> = {}
  ) =>
    ctx.blockFor?.(
      sub,
      action,
      {
        environment: secret.environment,
        secretPath: secret.path,
        secretName: secret.name,
        secretTags: ["*"],
        ...fields
      },
      action
    )
      ? "Access denied"
      : undefined;
  const describeDenied = (secretTags: string[]) =>
    denied(ProjectPermissionSub.Secrets, ProjectPermissionSecretActions.DescribeSecret, {
      secretTags
    }) &&
    denied(ProjectPermissionSub.Secrets, ProjectPermissionSecretActions.DescribeAndReadValue, {
      secretTags
    });
  const editDenied = denied(ProjectPermissionSub.Secrets, ProjectPermissionSecretActions.Edit);
  const canEdit = !ctx.writeBlock && !editDenied;
  const tagsDenied = denied(ProjectPermissionSub.Tags, ProjectPermissionActions.Read);
  const canCreateTags = !denied(ProjectPermissionSub.Tags, ProjectPermissionActions.Create);
  const historyDenied = denied(ProjectPermissionSub.Commits, ProjectPermissionActions.Read);
  const pendingType = ctx.pending?.[secret.id];
  const pendingSaveBlock =
    pendingType && denied(ProjectPermissionSub.Secrets, pendingSecretActions[pendingType]);
  const overrideBlock =
    secret.override !== undefined ? "Override already exists" : describeDenied(["*"]);
  const update: SecretUpdate = (target, patch, feedback) => {
    const saved = handlers.onUpdate(target, patch, feedback);
    setOpen(undefined);
    return saved;
  };
  let editBlock = ctx.writeBlock ?? editDenied;
  if (secret.honeyToken)
    editBlock = "Honey token secrets are managed by Infisical and can't be edited";
  if (secret.managedBy)
    editBlock = "Rotated secrets are managed by their secret rotation and can't be edited";
  let deleteBlock =
    ctx.writeBlock ?? denied(ProjectPermissionSub.Secrets, ProjectPermissionSecretActions.Delete);
  if (secret.honeyToken) deleteBlock = "Cannot delete honey token secret";
  if (secret.managedBy) deleteBlock = "Cannot delete rotated secret";
  let copyBlock: string | undefined;
  if (unreadable) copyBlock = "Access denied";
  else if (value === "") copyBlock = "No secret value";
  let { copySecretBlock } = handlers;
  if (secret.honeyToken) copySecretBlock = "Cannot copy honey token secret";
  if (secret.managedBy) copySecretBlock = "Cannot copy rotated secret";
  copySecretBlock ??= describeDenied(secret.tags);
  let resolvedBlock: string | undefined;
  if (unreadable) resolvedBlock = "Access denied";
  else if (pendingType) resolvedBlock = "Save pending changes to view resolved value";
  else if (value !== undefined && !hasReference(value)) resolvedBlock = "No references to resolve";
  let referencesBlock: string | undefined;
  if (unreadable) referencesBlock = "Access denied";
  else if (value === "") referencesBlock = "Create secret to view references";
  const popover = open && popovers.includes(open) ? open : undefined;
  const later = (action: () => void) => () => {
    pending.current = action;
  };
  const { guard } = usePlanGates();
  const select = (overlay: Overlay) =>
    later(() =>
      overlay === "share" || overlay === "references"
        ? withValue(() => setOpen(overlay))
        : setOpen(overlay)
    );
  const saved = (title: string) => ({ title });
  const rowActions: RowActionProps = {
    label: ctx.single ? secret.name : `${secret.name} in ${label}`,
    inline: [
      {
        label: "Edit value",
        icon: EditIcon,
        disabledReason: editBlock,
        onSelect: () => withValue(() => setOpen("edit"))
      }
    ],
    menu: (
      <>
        <PendingMenuItems id={secret.id} ctx={ctx} saveBlock={pendingSaveBlock} />
        <DropdownMenuItem
          disabled={Boolean(copyBlock)}
          description={copyBlock}
          onSelect={() =>
            withValue((loaded) =>
              copy(
                loaded,
                `Copied ${secret.name}.`,
                `Could not copy ${secret.name}. Check clipboard permissions.`,
                ctx.report
              )
            )
          }
        >
          <Icon name="copy" />
          Copy value
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Icon icon={PencilLineIcon} />
            Annotate
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={select("comment")}>
              <Icon icon={MessageSquareIcon} />
              {secret.comment ? "View comment" : "Add comment"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={Boolean(tagsDenied)}
              description={tagsDenied}
              onSelect={select("tags")}
            >
              <Icon name="tag" />
              {secret.tags.length ? "View tags" : "Add tags"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={select("reminder")}>
              <Icon icon={BellIcon} />
              {secret.reminder ? "View reminder" : "Add reminder"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={select("metadata")}>
              <Icon icon={CodeXmlIcon} />
              {secret.metadata.length ? "View metadata" : "Add metadata"}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Insights</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={Boolean(resolvedBlock)}
          description={resolvedBlock}
          onSelect={later(() =>
            withValue((loaded) =>
              hasReference(loaded)
                ? setOpen("resolved")
                : ctx.report(`${secret.name} has no references to resolve.`, "ok")
            )
          )}
        >
          <Icon name="braces" />
          View resolved value
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={Boolean(referencesBlock)}
          description={referencesBlock}
          onSelect={select("references")}
        >
          <Icon icon={WorkflowIcon} />
          Secret references
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={Boolean(historyDenied)}
          description={historyDenied}
          onSelect={select("history")}
        >
          <Icon name="history" />
          Version history
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={later(() => guard("accessInsights", () => setOpen("access")))}>
          <Icon icon={UsersIcon} />
          View access
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Manage</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={Boolean(secret.skipMultilineEncoding)}
          disabled={!canEdit}
          description={ctx.writeBlock ?? editDenied}
          onCheckedChange={() =>
            handlers.onUpdate(
              secret,
              { skipMultilineEncoding: !secret.skipMultilineEncoding },
              saved(`Multi-line encoding ${secret.skipMultilineEncoding ? "disabled" : "enabled"}`)
            )
          }
        >
          <Icon icon={WrapTextIcon} />
          Multi-line encoding
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem
          disabled={Boolean(overrideBlock)}
          description={overrideBlock}
          onSelect={later(onAddOverride)}
        >
          <Icon icon={GitBranchIcon} />
          Add override
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={unreadable}
          description={unreadable ? "Access denied" : undefined}
          onSelect={select("share")}
        >
          <Icon icon={ForwardIcon} />
          Share secret
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={Boolean(copySecretBlock)}
          description={copySecretBlock}
          onSelect={() => handlers.onCopySecret(secret)}
        >
          <Icon icon={CopyPlusIcon} />
          Copy to environment
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={Boolean(deleteBlock)}
          description={deleteBlock}
          onSelect={() => handlers.onDelete(secret)}
        >
          <Icon name="trash" />
          Delete secret
        </DropdownMenuItem>
      </>
    )
  };
  return (
    <RowContextMenu {...rowActions}>
      <TableRow
        {...row}
        focused={Boolean(popover)}
        onFocus={(event) => {
          const run = pending.current;
          if (event.target !== event.currentTarget || !run) return;
          pending.current = undefined;
          run();
        }}
      >
        {children}
        <TableActionsCell slots={ROW_ACTION_SLOTS}>
          <Popover
            open={Boolean(popover)}
            onOpenChange={(next) => {
              if (!next) setOpen(undefined);
            }}
          >
            <PopoverAnchor asChild>
              <RowActions
                lazy
                {...rowActions}
                menuLabel="More secret actions"
                onOpenChange={(next) => {
                  if (next) pending.current = undefined;
                }}
                onMenuCloseAutoFocus={(event) => {
                  const run = pending.current;
                  pending.current = undefined;
                  if (!run) return;
                  event.preventDefault();
                  run();
                }}
              />
            </PopoverAnchor>
            <PopoverContent
              draggable
              align="end"
              className={(popover && popoverClass[popover]) ?? styles.annotationPopover}
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              {popover === "comment" && (
                <CommentForm
                  comment={secret.comment}
                  canEdit={canEdit}
                  onClose={() => setOpen(undefined)}
                  onSave={(comment) =>
                    update(secret, { comment }, saved(`Updated the comment on ${secret.name}`))
                  }
                />
              )}
              {popover === "tags" && (
                <TagForm
                  tags={secret.tags}
                  options={handlers.tagOptions}
                  canEdit={canEdit}
                  canCreate={canCreateTags}
                  onClose={() => setOpen(undefined)}
                  onSave={(tags) =>
                    update(secret, { tags }, saved(`Updated tags on ${secret.name}`))
                  }
                />
              )}
              {popover === "resolved" && <ResolvedValue secret={secret} />}
              {popover === "metadata" && (
                <MetadataForm
                  metadata={secret.metadata}
                  canEdit={canEdit}
                  onClose={() => setOpen(undefined)}
                  onSave={(metadata) =>
                    update(secret, { metadata }, saved(`Updated metadata on ${secret.name}`))
                  }
                />
              )}
            </PopoverContent>
          </Popover>
          {open === "edit" && (
            <EditSecretSheet
              secret={secret}
              environmentLabel={label}
              tagOptions={handlers.tagOptions}
              title={ctx.single ? undefined : "Edit value"}
              saveLabel={ctx.single ? undefined : "Save"}
              onClose={() => setOpen(undefined)}
              canCreateTags={canCreateTags}
              onSave={(patch) =>
                handlers
                  .onUpdate(
                    secret,
                    patch,
                    saved(
                      ctx.single ? `Updated ${secret.name}` : `Updated ${secret.name} in ${label}`
                    )
                  )
                  .then((ok) => {
                    if (ok) setOpen(undefined);
                    return ok;
                  })
              }
            />
          )}
          {open === "reminder" && (
            <ReminderSheet
              open
              secretId={secret.id}
              projectId={secret.project}
              secretName={secret.name}
              environmentLabel={label}
              reminder={secret.reminder}
              canEdit={canEdit}
              onOpenChange={(next) => {
                if (!next) setOpen(undefined);
              }}
              onSave={(reminder, channels) => {
                const request = reminder
                  ? createReminder.mutateAsync({
                      secretId: secret.id,
                      message: reminder.message,
                      repeatDays: reminder.repeatDays ?? null,
                      fromDate: reminder.fromDate ? new Date(reminder.fromDate) : null,
                      nextReminderDate: reminder.nextReminderDate
                        ? new Date(reminder.nextReminderDate)
                        : null,
                      channels
                    })
                  : deleteReminder.mutateAsync({
                      secretId: secret.id,
                      reminderId: secret.reminder?.id ?? ""
                    });
                return request.then(
                  () => {
                    setOpen(undefined);
                    handlers.onRefresh();
                    ctx.report(
                      reminder
                        ? `${secret.reminder ? "Updated" : "Created"} the reminder on ${secret.name}.`
                        : `Deleted the reminder on ${secret.name}.`,
                      "ok"
                    );
                  },
                  (error) => {
                    failed(
                      reminder ? "Failed to save the reminder" : "Failed to delete the reminder",
                      error
                    );
                  }
                );
              }}
            />
          )}
          {seen.includes("history") && (
            <VersionHistorySheet
              open={open === "history"}
              secret={secret}
              environmentLabel={label}
              canRead={!unreadable}
              editBlock={editBlock}
              onOpenChange={(next) => setOpen(next ? "history" : undefined)}
              onCopy={(version) =>
                copy(
                  version,
                  "Version value copied to clipboard.",
                  "Could not copy the value. Check clipboard permissions.",
                  ctx.report
                )
              }
              onRestore={(version, restored) =>
                handlers.onUpdate(
                  secret,
                  { value: version.redacted ? "" : restored },
                  saved(`Restored ${secret.name} to version ${version.version}`)
                )
              }
              onRedact={(version) =>
                redactVersion
                  .mutateAsync({ versionId: version.id ?? "", secretId: secret.id })
                  .then(
                    () =>
                      ctx.report(`Redacted version ${version.version} of ${secret.name}.`, "ok"),
                    (error) => failed("Failed to redact the version", error)
                  )
              }
            />
          )}
          {open === "references" && (
            <ReferencesDialog
              open
              secret={secret}
              onOpenChange={(next) => setOpen(next ? "references" : undefined)}
              onNavigate={handlers.onNavigate}
            />
          )}
          {seen.includes("access") && (
            <AccessInsightsSheet
              open={open === "access"}
              secret={secret}
              environmentLabel={label}
              onOpenChange={(next) => setOpen(next ? "access" : undefined)}
            />
          )}
          {seen.includes("share") && (
            <ShareSecretSheet
              open={open === "share"}
              value={value ?? ""}
              onOpenChange={(next) => setOpen(next ? "share" : undefined)}
            />
          )}
        </TableActionsCell>
      </TableRow>
    </RowContextMenu>
  );
}

function EnvironmentValueEditor({
  secret,
  label,
  initial,
  draft,
  onUpdate,
  onRebase,
  onDone
}: {
  secret: Secret;
  label: string;
  initial: string;
  draft?: string;
  onUpdate: SecretUpdate;
  onRebase: (value: string) => void;
  onDone: () => void;
}) {
  const { dependents, isPending } = useDependents(secret);
  const [held, setHeld] = useState<{
    value: string;
    onFieldError: (message: string) => void;
    resolve: (ok: boolean | Promise<boolean>) => void;
  }>();
  const commit: InlineSave = (value, onFieldError) =>
    onUpdate(secret, { value }, { title: `Updated ${secret.name} in ${label}` }, onFieldError).then(
      (ok) => {
        if (ok) onDone();
        return ok;
      }
    );
  const release = (confirmed: boolean) => {
    if (!held) return;
    setHeld(undefined);
    held.resolve(confirmed ? commit(held.value, held.onFieldError) : false);
  };
  useEffect(() => {
    if (held && !isPending && !dependents.length) release(true);
  }, [held, isPending, dependents.length]);
  return (
    <>
      <InlineEditor
        multiline
        label={`Value of ${secret.name} in ${label}`}
        scope={secret}
        initial={initial}
        draft={draft}
        placeholder={secret.value.status === "unreadable" ? "Enter a new value" : "Secret value"}
        saveLabel="Save"
        undoLabel="Discard"
        unsaved={{
          key: draftKey(secret.project, secret.environment, secret.path, secret.name),
          change: (value) => ({
            projectId: secret.project,
            environment: secret.environment,
            secretPath: secret.path,
            secretKey: secret.name,
            secretValue: value,
            originalValue: initial,
            isCreate: false
          }),
          settle: (committed, value) =>
            committed.secretValue === value ? onDone() : onRebase(committed.secretValue)
        }}
        onCancel={onDone}
        onSave={(value, onFieldError) =>
          !isPending && !dependents.length
            ? commit(value, onFieldError)
            : new Promise((resolve) => {
                setHeld({ value, onFieldError, resolve });
              })
        }
      />
      <ConfirmDependentsDialog
        open={Boolean(held) && !isPending && dependents.length > 0}
        dependents={dependents}
        onOpenChange={(open) => {
          if (!open) release(false);
        }}
        onConfirm={() => release(true)}
      />
    </>
  );
}

function EnvironmentValueCell({
  secret,
  label,
  visible,
  ctx,
  onUpdate
}: {
  secret: Secret;
  label: string;
  visible: boolean;
  ctx: RowContext;
  onUpdate: SecretUpdate;
}) {
  const [editing, setEditing] = useState<{ initial: string; draft?: string }>();
  const loader = useValueLoader();
  const canEdit = canEditInline(secret, ctx);
  useHeldDraft(draftKey(secret.project, secret.environment, secret.path, secret.name), ([held]) => {
    if (held) setEditing({ initial: held.originalValue, draft: held.secretValue });
  });
  const begin = async () => {
    if (!canEdit || editing) return;
    const current = readableValue(secret);
    if (current !== undefined || secret.value.status === "unreadable") {
      setEditing({ initial: current ?? "" });
      return;
    }
    const values = await loader.ensure([secret]);
    const loaded =
      values[valueKey(secret.environment, secret.path, secret.name, false, secret.version)];
    if (typeof loaded === "string") setEditing({ initial: loaded });
    else ctx.report(`Could not read ${secret.name}.`, "bad");
  };
  return (
    <TableCell
      colSpan={2}
      className={styles.valueCell}
      data-editable={canEdit || undefined}
      tabIndex={canEdit && !editing ? 0 : undefined}
      onClick={() => begin()}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== "F2") return;
        event.preventDefault();
        begin();
      }}
    >
      <div className={styles.nameLine}>
        {editing ? (
          <EnvironmentValueEditor
            secret={secret}
            label={label}
            initial={editing.initial}
            draft={editing.draft}
            onUpdate={onUpdate}
            onRebase={(value) => setEditing((current) => current && { ...current, initial: value })}
            onDone={() => setEditing(undefined)}
          />
        ) : (
          <>
            <SecretValue secret={secret} visible={visible} />
            <Indicators secret={secret} />
          </>
        )}
      </div>
    </TableCell>
  );
}

function OverrideValue({
  secret,
  creating,
  visible,
  onStopCreating,
  onUpdate
}: {
  secret: Secret;
  creating: boolean;
  visible: boolean;
  onStopCreating: () => void;
  onUpdate: SecretUpdate;
}) {
  const [editing, setEditing] = useState(false);
  const loader = useValueLoader();
  const saved = (title: string) => ({ title });
  const value = secret.override ?? "";
  useEffect(() => {
    if (visible) loader.request([secret], true);
  }, [visible, secret.id]);
  if (creating || editing)
    return (
      <InlineEditor
        label={`Personal override for ${secret.name}`}
        scope={secret}
        initial={creating ? "" : value}
        placeholder="Enter personal override..."
        dirtyFromStart={creating}
        saveLabel={creating ? "Create override" : "Save override"}
        undoLabel={creating ? "Cancel override" : "Undo changes"}
        onCancel={() => {
          setEditing(false);
          onStopCreating();
        }}
        onSave={(override, onFieldError) =>
          onUpdate(
            secret,
            { override },
            saved(`${creating ? "Created" : "Updated"} your personal override for ${secret.name}`),
            onFieldError
          ).then((ok) => {
            if (!ok) return false;
            setEditing(false);
            onStopCreating();
            return true;
          })
        }
      />
    );
  return (
    <div className={`${styles.nameLine} ${styles.overrideValue}`}>
      <span
        className={styles.value}
        role="textbox"
        tabIndex={0}
        aria-label={`Personal override for ${secret.name}, focus to edit`}
        onFocus={() => {
          loader.ensure([secret], true).then(() => setEditing(true));
        }}
      >
        {visible ? <ReferenceText value={value || " "} scope={secret} /> : mask}
      </span>
    </div>
  );
}

function OverrideRow({
  secret,
  label,
  creating,
  ctx,
  onUpdate,
  children
}: {
  secret: Secret;
  label: string;
  creating: boolean;
  ctx: RowContext;
  onUpdate: SecretUpdate;
  children: ReactNode;
}) {
  const [removing, setRemoving] = useState(false);
  const loader = useValueLoader();
  const saved = (title: string) => ({ title });
  const block = creating ? "Create the override first" : undefined;
  const rowActions: RowActionProps = {
    label,
    menu: (
      <DropdownMenuItem
        variant="destructive"
        disabled={Boolean(block)}
        description={block}
        onSelect={() => setRemoving(true)}
      >
        <Icon name="trash" />
        Remove override
      </DropdownMenuItem>
    ),
    inline: [
      {
        label: "Copy override",
        icon: "copy",
        disabledReason: block,
        onSelect: () =>
          loader.ensure([secret], true).then((values) => {
            const loaded = values[valueKey(secret.environment, secret.path, secret.name, true)];
            return copy(
              typeof loaded === "string" ? loaded : (secret.override ?? ""),
              "Personal override copied to clipboard.",
              "Could not copy the override. Check clipboard permissions.",
              ctx.report
            );
          })
      }
    ]
  };
  return (
    <RowContextMenu {...rowActions}>
      <TableRow className={`${styles.row} ${styles.overrideRow}`}>
        {children}
        <TableActionsCell slots={ROW_ACTION_SLOTS}>
          <RowActions lazy {...rowActions} />
          <AlertDialog open={removing} onOpenChange={setRemoving}>
            <AlertDialogContent tone="danger">
              <AlertDialogHeader>
                <AlertDialogTitle>Remove override</AlertDialogTitle>
                <AlertDialogDescription>
                  The shared secret value is used instead.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() =>
                    onUpdate(
                      secret,
                      { override: undefined },
                      saved(`Removed your personal override for ${secret.name}`)
                    )
                  }
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TableActionsCell>
      </TableRow>
    </RowContextMenu>
  );
}

function SingleSecretRowView({
  rowKey,
  entries,
  ctx,
  revealAll,
  handlers
}: {
  rowKey: string;
  entries: Secret[];
  ctx: RowContext;
  revealAll: boolean;
  handlers: SecretRowHandlers;
}) {
  const [overlay, setOverlay] = useState<Overlay>();
  const [creatingOverride, setCreatingOverride] = useState(false);
  const loader = useValueLoader();
  const first = entries[0];
  const { name } = first;
  const showOverride = first.override !== undefined || creatingOverride;
  const pendingType = ctx.pending?.[first.id];
  const editable = canEditInline(first, ctx);
  const tagsBlock = ctx.blockFor?.(
    ProjectPermissionSub.Tags,
    ProjectPermissionActions.Read,
    { environment: first.environment, secretPath: first.path },
    "read tags"
  )
    ? "Access denied"
    : undefined;
  const loadValue = async () => {
    const current = readableValue(first);
    if (current !== undefined || first.value.status === "unreadable") return current ?? "";
    const stored = { ...first, name: ctx.renamedFrom?.[first.id] ?? first.name };
    const values = await loader.ensure([stored]);
    const loaded =
      values[valueKey(stored.environment, stored.path, stored.name, false, stored.version)];
    if (typeof loaded !== "string") ctx.report(`Could not read ${first.name}.`, "bad");
    return typeof loaded === "string" ? loaded : undefined;
  };
  return (
    <>
      <SecretActionsRow
        secret={first}
        ctx={ctx}
        handlers={handlers}
        onAddOverride={() => setCreatingOverride(true)}
        open={overlay}
        setOpen={setOverlay}
        row={{
          "data-recent": ctx.recent.includes(rowKey) || undefined,
          "data-pending": pendingType,
          className: `${styles.row} ${styles.topAligned}`
        }}
      >
        <SelectCell
          kind="secret"
          keys={[selectionKey(first)]}
          label={name}
          ctx={ctx}
          selectable
          overlay={overlayOf(first)}
        />
        <EditableCell
          pin="start"
          pinOffset="var(--cipher-size-row)"
          className={styles.nameCell}
          data-override-rule={first.override !== undefined || undefined}
          canEdit={editable && first.override === undefined}
          load={async () => name}
          editor={{
            label: `Name of ${name}`,
            scope: first,
            placeholder: "Secret name",
            transform: handlers.autoCapitalize ? (value) => value.toUpperCase() : undefined,
            validate: async (next) => {
              if (!next) return "Secret name is required";
              if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(next))
                return "Use letters, numbers and underscores, starting with a letter or underscore";
              if (handlers.secretNames.includes(next))
                return "A secret with this name already exists";
              if (next === ctx.renamedFrom?.[first.id]) return undefined;
              if (await handlers.secretNameTaken(next))
                return "A secret with this name already exists";
              return undefined;
            },
            onCommit: (next) =>
              handlers.onUpdate(first, { name: next }, { title: `Renamed ${name}` }),
            onInvalidBlur: (message) => ctx.report(message, "bad")
          }}
          trailing={
            pendingType !== "delete" && (
              <AnnotateMenu
                label={name}
                annotations={first}
                tagsBlock={tagsBlock}
                reminderBlock={
                  pendingType === "create" ? "Commit the secret to add a reminder" : undefined
                }
                onChoose={(kind) => {
                  if (kind) setOverlay(kind);
                }}
              />
            )
          }
        >
          <span className={styles.truncate} title={name}>
            {name}
          </span>
          <Annotations secret={first} onOpen={setOverlay} />
          <RowStateBadges rowKey={rowKey} resource={first} ctx={ctx} />
        </EditableCell>
        <EditableCell
          className={styles.valueCell}
          canEdit={editable}
          load={loadValue}
          dependentsOf={first}
          editor={{
            multiline: true,
            label: `Value of ${name}`,
            scope: first,
            placeholder: first.value.status === "unreadable" ? "Enter a new value" : "Secret value",
            onCommit: (value) => handlers.onUpdate(first, { value }, { title: `Updated ${name}` }),
            onInvalidBlur: (message) => ctx.report(message, "bad")
          }}
        >
          <SecretValue secret={first} visible={revealAll} />
          <Indicators secret={first} />
        </EditableCell>
      </SecretActionsRow>
      {showOverride && (
        <OverrideRow
          secret={first}
          label={`${name} override`}
          creating={creatingOverride}
          ctx={ctx}
          onUpdate={handlers.onUpdate}
        >
          <TableCell pin="start" selection divider={false}>
            <span className={styles.iconSlot}>
              <Icon icon={GitBranchIcon} label="Personal override" />
            </span>
          </TableCell>
          <TableCell
            pin="start"
            pinOffset="var(--cipher-size-row)"
            className={styles.nameCell}
            data-override-rule
          >
            <span className={styles.truncate}>{name}</span>
          </TableCell>
          <TableCell className={styles.valueCell}>
            <OverrideValue
              secret={first}
              creating={creatingOverride}
              visible={revealAll}
              onStopCreating={() => setCreatingOverride(false)}
              onUpdate={handlers.onUpdate}
            />
          </TableCell>
        </OverrideRow>
      )}
    </>
  );
}

function SecretRowView({
  rowKey,
  entries,
  ctx,
  revealAll,
  handlers
}: {
  rowKey: string;
  entries: Secret[];
  ctx: RowContext;
  revealAll: boolean;
  handlers: SecretRowHandlers;
}) {
  const expanded = ctx.expanded.includes(rowKey);
  const setExpanded = (open: boolean) => ctx.onExpand(rowKey, open);
  const [visibleOverride, setVisibleOverride] = useState<{ base: boolean; value: boolean }>();
  const rowVisible = visibleOverride?.base === revealAll ? visibleOverride.value : revealAll;
  const setRowVisible = (value: boolean) => setVisibleOverride({ base: revealAll, value });
  const [overlays, setOverlays] = useState<Record<string, Overlay | undefined>>({});
  const overlayFor = (environment: string) => (next: Overlay | undefined) =>
    setOverlays((current) => ({ ...current, [environment]: next }));
  const [renaming, setRenaming] = useState(false);
  const [creatingOverride, setCreatingOverride] = useState<string[]>([]);
  const first = entries[0];
  const { name } = first;
  const unsaved = useUnsavedEditsState();
  const pendingIn = (environment: string, present: boolean) => {
    if (!unsaved?.keys.has(draftKey(first.project, environment, first.path, name)))
      return undefined;
    return present ? "update" : "create";
  };
  const stopCreating = (environment: string) =>
    setCreatingOverride((current) => current.filter((entry) => entry !== environment));
  const startCreating = (environment: string) =>
    setCreatingOverride((current) => [...current, environment]);
  const status = (environment: string): EnvironmentStatus => {
    const secret = entries.find((entry) => entry.environment === environment);
    if (secret && readableValue(secret) === "") return "empty";
    if (secret) return "present";
    if (handlers.importedFrom(environment, name)) return "imported";
    return "missing";
  };
  const editDeniedIn = entries
    .map((entry) =>
      ctx.blockFor?.(
        ProjectPermissionSub.Secrets,
        ProjectPermissionSecretActions.Edit,
        {
          environment: entry.environment,
          secretPath: entry.path,
          secretName: entry.name,
          secretTags: entry.tags.length ? entry.tags : ["*"]
        },
        "rename this secret"
      )
    )
    .find(Boolean);
  let renameBlock = ctx.writeBlock ?? editDeniedIn;
  if (!renameBlock && entries.some((entry) => entry.honeyToken || entry.managedBy))
    renameBlock = "Managed secrets can't be renamed";
  else if (!renameBlock && entries.some((entry) => entry.override !== undefined))
    renameBlock = "Remove personal overrides first";
  else if (!renameBlock && unsaved?.committing) renameBlock = "Wait for Save to finish";
  const groupActions: RowActionProps = {
    label: name,
    menu: (
      <>
        <DropdownMenuItem
          onSelect={() =>
            copy(
              name,
              `Copied the name ${name}.`,
              "Could not copy the name. Check clipboard permissions.",
              ctx.report
            )
          }
        >
          <Icon name="copy" />
          Copy secret name
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={Boolean(renameBlock)}
          description={renameBlock}
          onSelect={() => setRenaming(true)}
        >
          <Icon name="pencil" />
          Edit secret name
        </DropdownMenuItem>
      </>
    )
  };
  return (
    <>
      <RowContextMenu {...groupActions}>
        <TableRow
          data-recent={ctx.recent.includes(rowKey) || undefined}
          className={styles.row}
          data-expanded={expanded || undefined}
          data-has-selection={
            entries.some((entry) => ctx.selected.includes(selectionKey(entry))) || undefined
          }
          onClick={() => setExpanded(!expanded)}
        >
          <ExpandCell
            expanded={expanded}
            label={name}
            onToggle={() => setExpanded(!expanded)}
            kind="secret"
          />
          <TableCell pin="start" pinOffset="var(--cipher-size-row)" className={styles.nameCell}>
            <div className={styles.nameLine}>
              <span className={styles.truncate} title={name}>
                {name}
              </span>
              <RowStateBadges rowKey={rowKey} ctx={ctx} />
            </div>
          </TableCell>
          {ctx.environments.map((environment) => {
            if (expanded) return <TableCell key={environment.value} />;
            const secret = entries.find((entry) => entry.environment === environment.value);
            return (
              <StatusCell
                key={environment.value}
                status={status(environment.value)}
                hasOverride={secret?.override !== undefined}
                pending={pendingIn(environment.value, Boolean(secret))}
                annotations={
                  secret && (
                    <Annotations
                      secret={secret}
                      onOpen={(next) => {
                        setExpanded(true);
                        overlayFor(environment.value)(next);
                      }}
                    />
                  )
                }
              />
            );
          })}
          <TableActionsCell slots={ROW_ACTION_SLOTS} onClick={stopRowClick}>
            <RowActions lazy {...groupActions} />
          </TableActionsCell>
        </TableRow>
      </RowContextMenu>
      {expanded && (
        <TableRow className={styles.nestedRow}>
          <TableCell
            pin="viewport"
            colSpan={ctx.environments.length + 3}
            className={styles.nestedCell}
          >
            <Table className={styles.nestedTable}>
              <TableHeader>
                <TableRow>
                  <ChildSelectHead resources={entries} label={name} ctx={ctx} />
                  <TableHead className={styles.envName}>Environment</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className={styles.revealHead}>
                    <Button
                      variant="ghost"
                      size="xs"
                      icon="eye"
                      onClick={() => setRowVisible(!rowVisible)}
                    >
                      {rowVisible ? "Hide values" : "Reveal values"}
                    </Button>
                  </TableHead>
                  <TableActionsHead slots={ROW_ACTION_SLOTS} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ctx.environments.flatMap((environment) => {
                  const secret = entries.find((entry) => entry.environment === environment.value);
                  const imported = handlers.importedFrom(environment.value, name);
                  const cells = (
                    <>
                      <ChildSelectCell
                        resource={secret}
                        label={`${name} in ${environment.label}`}
                        ctx={ctx}
                      />
                      <TableCell
                        className={styles.envName}
                        data-override-rule={secret?.override !== undefined || undefined}
                      >
                        <span className={styles.nameLine}>
                          <span className={styles.truncate}>{environment.label}</span>
                          {secret && (
                            <Annotations secret={secret} onOpen={overlayFor(environment.value)} />
                          )}
                          {!secret && imported && (
                            <Tooltip content={`Imported from ${imported}`}>
                              <span className={styles.hint}>
                                <Icon icon={ImportIcon} label={`Imported from ${imported}`} />
                              </span>
                            </Tooltip>
                          )}
                          {secret?.managedBy && (
                            <Icon
                              name="sync"
                              size="var(--cipher-size-icon-caption)"
                              label="Rotated secret"
                            />
                          )}
                          {secret?.honeyToken && (
                            <Icon
                              name="honey"
                              size="var(--cipher-size-icon-caption)"
                              label="Honey token secret"
                            />
                          )}
                        </span>
                      </TableCell>
                      {secret ? (
                        <EnvironmentValueCell
                          key={secret.id}
                          secret={secret}
                          label={environment.label}
                          visible={rowVisible}
                          ctx={ctx}
                          onUpdate={handlers.onUpdate}
                        />
                      ) : (
                        <TableCell colSpan={2} className={styles.valueCell}>
                          <div className={styles.nameLine}>
                            <SecretValue visible={rowVisible} />
                          </div>
                        </TableCell>
                      )}
                    </>
                  );
                  const addValue: RowActionProps = {
                    label: `${name} in ${environment.label}`,
                    inline: [
                      {
                        label: "Add value",
                        icon: EditIcon,
                        disabledReason:
                          ctx.writeBlock ??
                          (ctx.blockFor?.(
                            ProjectPermissionSub.Secrets,
                            ProjectPermissionSecretActions.Create,
                            {
                              environment: environment.value,
                              secretPath: ctx.path,
                              secretName: name,
                              secretTags: ["*"]
                            },
                            "add a value"
                          )
                            ? "Access denied"
                            : undefined),
                        onSelect: () => handlers.onCreateIn(environment.value, name)
                      }
                    ]
                  };
                  const rows = [
                    secret ? (
                      <SecretActionsRow
                        key={environment.value}
                        secret={secret}
                        ctx={ctx}
                        handlers={handlers}
                        onAddOverride={() => startCreating(environment.value)}
                        open={overlays[environment.value]}
                        setOpen={overlayFor(environment.value)}
                        row={{ className: styles.row }}
                      >
                        {cells}
                      </SecretActionsRow>
                    ) : (
                      <RowContextMenu key={environment.value} {...addValue}>
                        <TableRow className={styles.row}>
                          {cells}
                          <TableActionsCell slots={ROW_ACTION_SLOTS}>
                            <RowActions lazy {...addValue} />
                          </TableActionsCell>
                        </TableRow>
                      </RowContextMenu>
                    )
                  ];
                  if (
                    secret &&
                    (secret.override !== undefined || creatingOverride.includes(environment.value))
                  )
                    rows.push(
                      <OverrideRow
                        key={`${environment.value}-override`}
                        secret={secret}
                        label={`${name} override in ${environment.label}`}
                        creating={creatingOverride.includes(environment.value)}
                        ctx={ctx}
                        onUpdate={handlers.onUpdate}
                      >
                        <TableCell selection divider={false} />
                        <TableCell className={styles.envName} data-override-rule />
                        <TableCell colSpan={2} className={styles.valueCell}>
                          <div className={styles.nameLine}>
                            <Icon icon={GitBranchIcon} size={14} label="Personal override" />
                            <OverrideValue
                              secret={secret}
                              creating={creatingOverride.includes(environment.value)}
                              visible={rowVisible}
                              onStopCreating={() => stopCreating(environment.value)}
                              onUpdate={handlers.onUpdate}
                            />
                          </div>
                        </TableCell>
                      </OverrideRow>
                    );
                  return rows;
                })}
              </TableBody>
            </Table>
          </TableCell>
        </TableRow>
      )}
      {renaming && (
        <RenameSecretDialog
          name={name}
          environmentCount={entries.length}
          autoCapitalize={handlers.autoCapitalize}
          onRename={(next, onFieldError) => handlers.onRename(entries, next, onFieldError)}
          onClose={() => setRenaming(false)}
        />
      )}
    </>
  );
}

export const SecretRow = memo(
  (props: ComponentProps<typeof SecretRowView>) =>
    props.ctx.single ? <SingleSecretRowView {...props} /> : <SecretRowView {...props} />,
  sameRow
);
