import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
import {
  BellIcon,
  CodeXmlIcon,
  CopyPlusIcon,
  EditIcon,
  EyeOffIcon,
  ForwardIcon,
  GitBranchIcon,
  HexagonIcon,
  ImportIcon,
  MessageSquareIcon,
  PencilLineIcon,
  TagsIcon,
  UsersIcon,
  WorkflowIcon,
  WrapTextIcon
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
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
import { Popover, PopoverAnchor, PopoverContent } from "@app/components/v4/ui/popover";
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
  TableRowActions,
  TableRowIndicators
} from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

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
import { environmentLabel } from "./flows/shared";
import {
  ActionButton,
  ChildSelectCell,
  ChildSelectHead,
  type EnvironmentStatus,
  ExpandCell,
  KindIcon,
  type KindOverlay,
  NEXT_PHASE,
  PendingBadge,
  PendingMenuItems,
  ROW_ACTION_SLOTS,
  type RowActionProps,
  type RowContext,
  SelectCell,
  StatusCell,
  stopRowClick
} from "./overview-cells";
import { AccessInsightsSheet } from "./row-actions/access-insights-sheet";
import { CommentForm, MetadataForm, ReminderSheet, TagForm } from "./row-actions/annotations";
import { EditSecretSheet } from "./row-actions/edit-secret-sheet";
import { ReferencesDialog } from "./row-actions/references-dialog";
import { ShareSecretSheet } from "./row-actions/share-secret-sheet";
import type { SecretUpdate } from "./row-actions/types";
import { VersionHistorySheet } from "./row-actions/version-history-sheet";
import {
  hasReference,
  ReferenceEditor,
  ReferenceText,
  ResolvedValueButton
} from "./secret-references";

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
  | "share";
const popovers: Overlay[] = ["comment", "tags", "metadata"];

const copy = async (
  value: string,
  done: string,
  failed: string,
  report: (message: string) => void
) => {
  try {
    await navigator.clipboard.writeText(value);
    report(done);
  } catch {
    report(failed);
  }
};

function SecretValue({
  secret,
  visible,
  pending
}: {
  secret?: Secret;
  visible: boolean;
  pending?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [resolving, setResolving] = useState(false);
  const loader = useValueLoader();
  const shown = visible || focused || resolving;
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
    <>
      {(focused || resolving) && !loading && hasReference(value) && (
        <ResolvedValueButton
          secret={secret}
          disabledReason={pending ? "Save pending changes to view resolved value" : undefined}
          open={resolving}
          onOpenChange={setResolving}
        />
      )}
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
        {value !== "" &&
          (shown && !loading ? <ReferenceText value={value} scope={secret} /> : mask)}
      </span>
    </>
  );
}

function InlineEditor({
  label,
  scope,
  initial,
  placeholder,
  saveLabel,
  undoLabel,
  dirtyFromStart,
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
  onSave: (value: string) => void;
  onCancel: () => void;
  idle?: ReactNode;
}) {
  const [draft, setDraft] = useState(initial);
  const root = useRef<HTMLDivElement>(null);
  const dirty = dirtyFromStart || draft !== initial;
  return (
    <div ref={root} className={styles.inlineEdit}>
      <ReferenceEditor
        value={draft}
        scope={scope}
        onValueChange={setDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter" && dirty) {
            event.preventDefault();
            onSave(draft);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={(event) => {
          if (!dirty && !root.current?.contains(event.relatedTarget as Node)) onCancel();
        }}
      >
        {(control) => (
          <Input
            {...control}
            autoFocus
            className={styles.inlineInput}
            aria-label={label}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </ReferenceEditor>
      {dirty ? (
        <span className={styles.quickActions}>
          <Button variant="ghost" size="xs" onClick={onCancel}>
            {undoLabel}
          </Button>
          <Button size="xs" onClick={() => onSave(draft)}>
            {saveLabel}
          </Button>
        </span>
      ) : (
        idle
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

function Annotations({
  secret,
  onOpen
}: {
  secret: Secret;
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
            <Icon icon={mark.icon} size={12} />
            <span className="sr-only">{`${mark.label} for ${secret.name}`}</span>
          </Button>
        </Tooltip>
      ))}
    </span>
  );
}

function SecretActionsRow({
  secret,
  ctx,
  handlers,
  onInlineEdit,
  onAddOverride,
  open,
  setOpen,
  row,
  children
}: {
  secret: Secret;
  ctx: RowContext;
  handlers: SecretRowHandlers;
  onInlineEdit: () => void;
  onAddOverride: () => void;
  open: Overlay | undefined;
  setOpen: (overlay: Overlay | undefined) => void;
  row: ComponentProps<typeof TableRow> & { [key: `data-${string}`]: unknown };
  children: ReactNode;
}) {
  const pending = useRef<() => void>(undefined);
  const keepFocus = useRef(false);
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
      else ctx.report(`Could not read ${secret.name}.`);
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
    handlers.onUpdate(target, patch, feedback);
    setOpen(undefined);
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
  let referencesBlock: string | undefined;
  if (unreadable) referencesBlock = "Access denied";
  else if (value === "") referencesBlock = "Create secret to view references";
  const popover = open && popovers.includes(open) ? open : undefined;
  const later = (action: () => void) => () => {
    pending.current = action;
  };
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
        onSelect: () => withValue(() => (ctx.single ? setOpen("edit") : onInlineEdit()))
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
              <Icon icon={TagsIcon} />
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
        <DropdownMenuItem onSelect={select("access")}>
          <Icon icon={UsersIcon} />
          View access
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Manage</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={Boolean(secret.skipMultilineEncoding)}
          disabled={!canEdit}
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
              <TableRowActions>
                {rowActions.inline?.map((action) => (
                  <ActionButton
                    key={action.label}
                    label={action.label}
                    name={typeof action.icon === "string" ? action.icon : undefined}
                    icon={typeof action.icon === "string" ? undefined : action.icon}
                    disabledReason={action.disabledReason}
                    onClick={action.onSelect}
                  />
                ))}
                <DropdownMenu
                  onOpenChange={(next) => {
                    const run = pending.current;
                    pending.current = undefined;
                    if (next || !run) return;
                    keepFocus.current = true;
                    setTimeout(run, 0);
                  }}
                >
                  <Tooltip content="Secret actions">
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-row"
                        iconOnly
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Icon name="more" />
                        <span className="sr-only">More secret actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                  </Tooltip>
                  <DropdownMenuContent
                    align="end"
                    onCloseAutoFocus={(event) => {
                      if (!keepFocus.current) return;
                      keepFocus.current = false;
                      event.preventDefault();
                    }}
                  >
                    {rowActions.menu}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableRowActions>
            </PopoverAnchor>
            <PopoverContent
              draggable
              align="end"
              className={popover === "metadata" ? styles.metadataPopover : styles.annotationPopover}
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
              onClose={() => setOpen(undefined)}
              onSave={(patch) => update(secret, patch, saved(`Updated ${secret.name}`))}
            />
          )}
          {open === "reminder" && (
            <ReminderSheet
              open
              secretName={secret.name}
              environmentLabel={label}
              reminder={secret.reminder}
              canEdit={canEdit}
              onOpenChange={(next) => {
                if (!next) setOpen(undefined);
              }}
              onSave={(reminder) => {
                const request = reminder
                  ? createReminder.mutateAsync({
                      secretId: secret.id,
                      message: reminder.message,
                      repeatDays: reminder.repeatDays ?? null,
                      fromDate: reminder.fromDate ? new Date(reminder.fromDate) : null,
                      nextReminderDate: reminder.nextReminderDate
                        ? new Date(reminder.nextReminderDate)
                        : null,
                      recipients: reminder.recipients
                    })
                  : deleteReminder.mutateAsync({
                      secretId: secret.id,
                      reminderId: secret.reminder?.id ?? ""
                    });
                setOpen(undefined);
                request.then(
                  () => {
                    handlers.onRefresh();
                    ctx.report(
                      reminder
                        ? `${secret.reminder ? "Updated" : "Created"} the reminder on ${secret.name}.`
                        : `Deleted the reminder on ${secret.name}.`
                    );
                  },
                  () => ctx.report(`Could not save the reminder on ${secret.name}.`)
                );
              }}
            />
          )}
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
              redactVersion.mutateAsync({ versionId: version.id ?? "", secretId: secret.id }).then(
                () => ctx.report(`Redacted version ${version.version} of ${secret.name}.`),
                () => ctx.report(`Could not redact version ${version.version}.`)
              )
            }
          />
          {open === "references" && (
            <ReferencesDialog
              open
              secret={secret}
              onOpenChange={(next) => setOpen(next ? "references" : undefined)}
              onNavigate={handlers.onNavigate}
            />
          )}
          <AccessInsightsSheet
            open={open === "access"}
            secret={secret}
            environmentLabel={label}
            onOpenChange={(next) => setOpen(next ? "access" : undefined)}
          />
          <ShareSecretSheet
            open={open === "share"}
            value={value ?? ""}
            onOpenChange={(next) => setOpen(next ? "share" : undefined)}
          />
        </TableActionsCell>
      </TableRow>
    </RowContextMenu>
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
        onSave={(override) => {
          onUpdate(
            secret,
            { override },
            saved(`${creating ? "Created" : "Updated"} your personal override for ${secret.name}`)
          );
          setEditing(false);
          onStopCreating();
        }}
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
          <RowActions {...rowActions} />
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

export function SecretRow({
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
  const [overlay, setOverlay] = useState<Overlay>();
  const [overlays, setOverlays] = useState<Record<string, Overlay | undefined>>({});
  const overlayFor = (environment: string) => (next: Overlay | undefined) =>
    setOverlays((current) => ({ ...current, [environment]: next }));
  const [editing, setEditing] = useState<string>();
  const [creatingOverride, setCreatingOverride] = useState<string[]>([]);
  const first = entries[0];
  const { name } = first;
  const stopCreating = (environment: string) =>
    setCreatingOverride((current) => current.filter((entry) => entry !== environment));
  const startCreating = (environment: string) =>
    setCreatingOverride((current) => [...current, environment]);
  const saveInline = (secret: Secret, value: string) => {
    handlers.onUpdate(
      secret,
      { value },
      {
        title: `Updated ${secret.name} in ${environmentLabel(secret.environment)}`
      }
    );
    setEditing(undefined);
  };
  if (ctx.single) {
    const showOverride =
      first.override !== undefined || creatingOverride.includes(first.environment);
    return (
      <>
        <SecretActionsRow
          secret={first}
          ctx={ctx}
          handlers={handlers}
          onInlineEdit={() => setEditing(first.environment)}
          onAddOverride={() => startCreating(first.environment)}
          open={overlay}
          setOpen={setOverlay}
          row={{
            "data-state": ctx.recent.includes(rowKey) ? "selected" : undefined,
            "data-pending": ctx.pending?.[first.id],
            className: styles.row
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
          <TableCell
            className={styles.nameCell}
            data-override-rule={first.override !== undefined || undefined}
          >
            <div className={styles.nameLine}>
              <span className={styles.truncate} title={name}>
                {name}
              </span>
              <Annotations secret={first} onOpen={setOverlay} />
              <PendingBadge type={ctx.pending?.[first.id]} />
            </div>
          </TableCell>
          <TableCell className={styles.valueCell}>
            <div className={styles.nameLine}>
              <SecretValue
                secret={first}
                visible={revealAll}
                pending={Boolean(ctx.pending?.[first.id])}
              />
              <Indicators secret={first} />
            </div>
          </TableCell>
        </SecretActionsRow>
        {showOverride && (
          <OverrideRow
            secret={first}
            label={`${name} override`}
            creating={creatingOverride.includes(first.environment)}
            ctx={ctx}
            onUpdate={handlers.onUpdate}
          >
            <TableCell selection divider={false}>
              <span className={styles.iconSlot}>
                <Icon icon={GitBranchIcon} label="Personal override" />
              </span>
            </TableCell>
            <TableCell className={styles.nameCell} data-override-rule>
              <span className={styles.truncate}>{name}</span>
            </TableCell>
            <TableCell className={styles.valueCell}>
              <OverrideValue
                secret={first}
                creating={creatingOverride.includes(first.environment)}
                visible={revealAll}
                onStopCreating={() => stopCreating(first.environment)}
                onUpdate={handlers.onUpdate}
              />
            </TableCell>
          </OverrideRow>
        )}
      </>
    );
  }
  const status = (environment: string): EnvironmentStatus => {
    const secret = entries.find((entry) => entry.environment === environment);
    if (secret && readableValue(secret) === "") return "empty";
    if (secret) return "present";
    if (handlers.importedFrom(environment, name)) return "imported";
    return "missing";
  };
  const groupActions: RowActionProps = {
    label: name,
    menu: (
      <DropdownMenuItem disabled description={NEXT_PHASE}>
        <Icon icon={EditIcon} />
        Edit secret name
      </DropdownMenuItem>
    ),
    inline: [
      {
        label: "Copy secret name",
        icon: "copy",
        onSelect: () =>
          copy(
            name,
            `Copied the name ${name}.`,
            "Could not copy the name. Check clipboard permissions.",
            ctx.report
          )
      }
    ]
  };
  return (
    <>
      <RowContextMenu {...groupActions}>
        <TableRow
          data-state={ctx.recent.includes(rowKey) ? "selected" : undefined}
          className={styles.row}
          data-expanded={expanded || undefined}
          onClick={() => setExpanded(!expanded)}
        >
          <ExpandCell expanded={expanded} label={name} onToggle={() => setExpanded(!expanded)} />
          <TableCell className={styles.nameCell}>
            <div className={styles.nameLine}>
              <span className={styles.nameKind}>
                <KindIcon kind="secret" />
              </span>
              <span className={styles.truncate} title={name}>
                {name}
              </span>
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
            <RowActions {...groupActions} />
          </TableActionsCell>
        </TableRow>
      </RowContextMenu>
      {expanded && (
        <TableRow className={styles.nestedRow}>
          <TableCell colSpan={ctx.environments.length + 3} className={styles.nestedCell}>
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
                            <Icon name="sync" size={12} label="Rotated secret" />
                          )}
                          {secret?.honeyToken && (
                            <Icon icon={HexagonIcon} size={12} label="Honey token secret" />
                          )}
                        </span>
                      </TableCell>
                      <TableCell colSpan={2} className={styles.valueCell}>
                        {secret && editing === environment.value ? (
                          <InlineEditor
                            label={`Value of ${name} in ${environment.label}`}
                            scope={secret}
                            initial={readableValue(secret) ?? ""}
                            saveLabel="Save"
                            undoLabel="Undo"
                            onCancel={() => setEditing(undefined)}
                            onSave={(value) => saveInline(secret, value)}
                          />
                        ) : (
                          <div className={styles.nameLine}>
                            <SecretValue
                              secret={secret}
                              visible={rowVisible}
                              pending={Boolean(secret && ctx.pending?.[secret.id])}
                            />
                            {secret && <Indicators secret={secret} />}
                          </div>
                        )}
                      </TableCell>
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
                        onInlineEdit={() => setEditing(environment.value)}
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
                            <RowActions {...addValue} />
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
    </>
  );
}
