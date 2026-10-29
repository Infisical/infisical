import { type ReactNode, useRef, useState } from "react";
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
  TableRow,
  TableRowActions,
  TableRowActionsSeparator,
  TableRowIndicators
} from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import {
  readableValue,
  type Resource,
  type Scope,
  type Secret,
  versionsOf
} from "../secrets-model";
import { environmentLabel, LOCAL_ONLY } from "./flows/shared";
import {
  ActionButton,
  type EnvironmentStatus,
  ExpandToggle,
  type KindOverlay,
  NEXT_PHASE,
  PendingActions,
  type RowContext,
  SelectCell,
  StatusCell
} from "./overview-cells";
import { AccessInsightsSheet } from "./row-actions/access-insights-sheet";
import { CommentForm, MetadataForm, ReminderSheet, TagForm } from "./row-actions/annotations";
import { EditSecretSheet } from "./row-actions/edit-secret-sheet";
import { dependentsOf, ReferencesDialog } from "./row-actions/references-dialog";
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
  if (!secret) return <span className={styles.subtle}>Not set in this environment</span>;
  const value = readableValue(secret);
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
      {(focused || resolving) && hasReference(value) && (
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
          (visible || focused || resolving ? <ReferenceText value={value} scope={secret} /> : mask)}
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
            mono
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
  const marks = [
    secret.tags.length > 0 && {
      icon: TagsIcon,
      label: `${secret.tags.length} tag${secret.tags.length > 1 ? "s" : ""}`
    },
    secret.reminder && { icon: BellIcon, label: "Has reminder" },
    secret.metadata.length > 0 && { icon: CodeXmlIcon, label: "Has metadata" },
    secret.skipMultilineEncoding && { icon: WrapTextIcon, label: "Multi-line encoding disabled" }
  ].filter(Boolean) as { icon: typeof TagsIcon; label: string }[];
  if (!marks.length) return null;
  return (
    <TableRowIndicators swap>
      {marks.map((mark) => (
        <Tooltip key={mark.label} content={mark.label}>
          <span className={styles.hint}>
            <Icon icon={mark.icon} label={mark.label} />
          </span>
        </Tooltip>
      ))}
    </TableRowIndicators>
  );
}

function SecretActions({
  secret,
  ctx,
  handlers,
  onInlineEdit,
  onAddOverride
}: {
  secret: Secret;
  ctx: RowContext;
  handlers: SecretRowHandlers;
  onInlineEdit: () => void;
  onAddOverride: () => void;
}) {
  const [open, setOpen] = useState<Overlay>();
  const pending = useRef<() => void>(undefined);
  const keepFocus = useRef(false);
  const value = readableValue(secret);
  const label = environmentLabel(secret.environment);
  const canEdit = !ctx.writeBlock;
  const update: SecretUpdate = (target, patch, feedback) => {
    handlers.onUpdate(target, patch, feedback);
    setOpen(undefined);
  };
  let editBlock = ctx.writeBlock;
  if (secret.honeyToken)
    editBlock = "Honey token secrets are managed by Infisical and can't be edited";
  if (secret.managedBy)
    editBlock = "Rotated secrets are managed by their secret rotation and can't be edited";
  let deleteBlock = ctx.writeBlock;
  if (secret.honeyToken) deleteBlock = "Cannot delete honey token secret";
  if (secret.managedBy) deleteBlock = "Cannot delete rotated secret";
  let copyBlock: string | undefined;
  if (value === undefined) copyBlock = "Access denied";
  else if (value === "") copyBlock = "No secret value";
  let { copySecretBlock } = handlers;
  if (secret.honeyToken) copySecretBlock = "Cannot copy honey token secret";
  if (secret.managedBy) copySecretBlock = "Cannot copy rotated secret";
  let referencesBlock: string | undefined;
  if (value === undefined) referencesBlock = "Access denied";
  else if (value === "") referencesBlock = "Create secret to view references";
  const annotated = Boolean(
    (!ctx.single && secret.comment) ||
    secret.tags.length ||
    secret.reminder ||
    secret.metadata.length
  );
  const popover = open && popovers.includes(open) ? open : undefined;
  const later = (action: () => void) => () => {
    pending.current = action;
  };
  const select = (overlay: Overlay) => later(() => setOpen(overlay));
  const saved = (title: string) => ({ title, description: LOCAL_ONLY });
  return (
    <>
      <Popover
        open={Boolean(popover)}
        onOpenChange={(next) => {
          if (!next) setOpen(undefined);
        }}
      >
        <PopoverAnchor asChild>
          <TableRowActions reveal open={Boolean(popover)}>
            <PendingActions id={secret.id} ctx={ctx} />
            {!ctx.single && secret.comment && (
              <ActionButton
                label="View comment"
                icon={MessageSquareIcon}
                onClick={() => setOpen("comment")}
              />
            )}
            {secret.tags.length > 0 && (
              <ActionButton label="View tags" icon={TagsIcon} onClick={() => setOpen("tags")} />
            )}
            {secret.reminder && (
              <ActionButton
                label="View reminder"
                icon={BellIcon}
                onClick={() => setOpen("reminder")}
              />
            )}
            {secret.metadata.length > 0 && (
              <ActionButton
                label="View metadata"
                icon={CodeXmlIcon}
                onClick={() => setOpen("metadata")}
              />
            )}
            {annotated && <TableRowActionsSeparator />}
            <ActionButton
              label="Edit value"
              icon={EditIcon}
              disabledReason={editBlock}
              onClick={() => (ctx.single ? setOpen("edit") : onInlineEdit())}
            />
            <ActionButton
              label="Copy secret"
              name="copy"
              disabledReason={copyBlock}
              onClick={() =>
                copy(
                  value ?? "",
                  `Copied ${secret.name}.`,
                  `Could not copy ${secret.name}. Check clipboard permissions.`,
                  ctx.report
                )
              }
            />
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
                    <DropdownMenuItem onSelect={select("tags")}>
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
                <DropdownMenuItem onSelect={select("history")}>
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
                      saved(
                        `Multi-line encoding ${secret.skipMultilineEncoding ? "disabled" : "enabled"}`
                      )
                    )
                  }
                >
                  <Icon icon={WrapTextIcon} />
                  Multi-line encoding
                </DropdownMenuCheckboxItem>
                <DropdownMenuItem
                  disabled={secret.override !== undefined}
                  description={
                    secret.override !== undefined ? "Override already exists" : undefined
                  }
                  onSelect={later(onAddOverride)}
                >
                  <Icon icon={GitBranchIcon} />
                  Add override
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={value === undefined}
                  description={value === undefined ? "Access denied" : undefined}
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
                  Copy secret
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
              </DropdownMenuContent>
            </DropdownMenu>
          </TableRowActions>
        </PopoverAnchor>
        <PopoverContent
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
              onClose={() => setOpen(undefined)}
              onSave={(tags) => update(secret, { tags }, saved(`Updated tags on ${secret.name}`))}
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
          dependents={dependentsOf(handlers.resources, secret)}
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
          onSave={(reminder) =>
            update(
              secret,
              { reminder },
              saved(
                reminder
                  ? `${secret.reminder ? "Updated" : "Created"} the reminder on ${secret.name}`
                  : `Deleted the reminder on ${secret.name}`
              )
            )
          }
        />
      )}
      <VersionHistorySheet
        open={open === "history"}
        secret={secret}
        environmentLabel={label}
        canRead={value !== undefined}
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
        onRestore={(version) =>
          handlers.onUpdate(
            secret,
            { value: version.redacted ? "" : version.value },
            saved(`Restored ${secret.name} to version ${version.version}`)
          )
        }
        onRedact={(version) =>
          handlers.onUpdate(
            secret,
            {
              versions: versionsOf(secret).map((entry) =>
                entry.version === version.version ? { ...entry, redacted: true, value: "" } : entry
              )
            },
            saved(`Redacted version ${version.version} of ${secret.name}`)
          )
        }
      />
      {open === "references" && (
        <ReferencesDialog
          open
          secret={secret}
          resources={handlers.resources}
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
    </>
  );
}

function OverrideValue({
  secret,
  creating,
  visible,
  ctx,
  onStopCreating,
  onUpdate
}: {
  secret: Secret;
  creating: boolean;
  visible: boolean;
  ctx: RowContext;
  onStopCreating: () => void;
  onUpdate: SecretUpdate;
}) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const saved = (title: string) => ({ title, description: LOCAL_ONLY });
  const value = secret.override ?? "";
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
        onFocus={() => setEditing(true)}
      >
        {visible ? <ReferenceText value={value || " "} scope={secret} /> : mask}
      </span>
      <TableRowActions>
        <ActionButton
          label="Copy override"
          name="copy"
          onClick={() =>
            copy(
              value,
              "Personal override copied to clipboard.",
              "Could not copy the override. Check clipboard permissions.",
              ctx.report
            )
          }
        />
        <ActionButton label="Remove override" name="trash" onClick={() => setRemoving(true)} />
      </TableRowActions>
      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent tone="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove override</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this personal override? The shared secret value will
              be used instead.
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
    </div>
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
  const [expanded, setExpanded] = useState(false);
  const [rowVisible, setRowVisible] = useState(false);
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
        title: `Updated ${secret.name} in ${environmentLabel(secret.environment)}`,
        description: LOCAL_ONLY
      }
    );
    setEditing(undefined);
  };
  if (ctx.single) {
    const showOverride =
      first.override !== undefined || creatingOverride.includes(first.environment);
    return (
      <>
        <TableRow
          data-state={ctx.recent.includes(rowKey) ? "selected" : undefined}
          data-pending={ctx.pending?.[first.id]}
          className={styles.row}
        >
          <SelectCell
            kind="secret"
            rowKey={rowKey}
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
              {first.comment && (
                <Tooltip content={first.comment}>
                  <span className={styles.hint}>
                    <Icon icon={MessageSquareIcon} size={12} label="View secret comment" />
                  </span>
                </Tooltip>
              )}
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
              <SecretActions
                secret={first}
                ctx={ctx}
                handlers={handlers}
                onInlineEdit={() => setEditing(first.environment)}
                onAddOverride={() => startCreating(first.environment)}
              />
            </div>
          </TableCell>
        </TableRow>
        {showOverride && (
          <TableRow className={`${styles.row} ${styles.overrideRow}`}>
            <TableCell className={styles.iconCell}>
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
                ctx={ctx}
                onStopCreating={() => stopCreating(first.environment)}
                onUpdate={handlers.onUpdate}
              />
            </TableCell>
          </TableRow>
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
  return (
    <>
      <TableRow
        data-state={ctx.recent.includes(rowKey) ? "selected" : undefined}
        className={`${styles.row} ${styles.clickable}`}
        data-expanded={expanded || undefined}
        onClick={() => setExpanded(!expanded)}
      >
        <SelectCell
          kind="secret"
          rowKey={rowKey}
          label={name}
          ctx={ctx}
          selectable
          pinned={expanded}
          alternate={
            expanded ? (
              <ExpandToggle expanded label={name} onToggle={() => setExpanded(false)} />
            ) : undefined
          }
        />
        <TableCell className={styles.nameCell}>
          <div className={styles.nameLine}>
            <span className={styles.truncate} title={name}>
              {name}
            </span>
            <TableRowActions reveal>
              <ActionButton
                label="Copy secret name"
                name="copy"
                onClick={() =>
                  copy(
                    name,
                    `Copied the name ${name}.`,
                    "Could not copy the name. Check clipboard permissions.",
                    ctx.report
                  )
                }
              />
              <ActionButton label="Edit secret name" icon={EditIcon} disabledReason={NEXT_PHASE} />
            </TableRowActions>
          </div>
        </TableCell>
        {ctx.environments.map((environment) =>
          expanded ? (
            <TableCell key={environment.value} />
          ) : (
            <StatusCell
              key={environment.value}
              status={status(environment.value)}
              hasOverride={entries.some(
                (entry) => entry.environment === environment.value && entry.override !== undefined
              )}
            />
          )
        )}
      </TableRow>
      {expanded && (
        <TableRow className={styles.nestedRow}>
          <TableCell colSpan={ctx.environments.length + 2} className={styles.nestedCell}>
            <Table className={styles.nestedTable}>
              <TableHeader>
                <TableRow>
                  <TableHead className={styles.iconCell} />
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {ctx.environments.flatMap((environment) => {
                  const secret = entries.find((entry) => entry.environment === environment.value);
                  const imported = handlers.importedFrom(environment.value, name);
                  const rows = [
                    <TableRow key={environment.value} className={styles.row}>
                      <TableCell className={styles.iconCell} />
                      <TableCell
                        className={styles.envName}
                        data-override-rule={secret?.override !== undefined || undefined}
                      >
                        <span className={styles.nameLine}>
                          <span className={styles.truncate}>{environment.label}</span>
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
                            {secret ? (
                              <SecretActions
                                secret={secret}
                                ctx={ctx}
                                handlers={handlers}
                                onInlineEdit={() => setEditing(environment.value)}
                                onAddOverride={() => startCreating(environment.value)}
                              />
                            ) : (
                              <TableRowActions reveal>
                                <ActionButton
                                  label="Add value"
                                  icon={EditIcon}
                                  disabledReason={ctx.writeBlock}
                                  onClick={() => handlers.onCreateIn(environment.value, name)}
                                />
                              </TableRowActions>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ];
                  if (
                    secret &&
                    (secret.override !== undefined || creatingOverride.includes(environment.value))
                  )
                    rows.push(
                      <TableRow
                        key={`${environment.value}-override`}
                        className={`${styles.row} ${styles.overrideRow}`}
                      >
                        <TableCell className={styles.iconCell} />
                        <TableCell className={styles.envName} data-override-rule />
                        <TableCell colSpan={2} className={styles.valueCell}>
                          <div className={styles.nameLine}>
                            <Icon icon={GitBranchIcon} size={14} label="Personal override" />
                            <OverrideValue
                              secret={secret}
                              creating={creatingOverride.includes(environment.value)}
                              visible={rowVisible}
                              ctx={ctx}
                              onStopCreating={() => stopCreating(environment.value)}
                              onUpdate={handlers.onUpdate}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
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
