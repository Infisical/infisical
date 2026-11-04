import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  BellIcon,
  CodeXmlIcon,
  CopyPlusIcon,
  EditIcon,
  EyeOffIcon,
  ForwardIcon,
  GitBranchIcon,
  HexagonIcon,
  MessageSquareIcon,
  PencilLineIcon,
  TagsIcon,
  UsersIcon,
  WorkflowIcon,
  WrapTextIcon
} from "lucide-react";

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
import {
  RowActions,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  TableRowIndicators
} from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { useV4Adapter } from "../../data/adapters";
import {
  ActionButton,
  copyText,
  type EnvironmentStatus,
  ExpandToggle,
  type KindOverlay,
  NOT_PORTED,
  ROW_ACTION_SLOTS,
  type RowContext,
  SelectCell,
  StatusCell
} from "./cells";
import type { Row, SecretEntry } from "./model";

import styles from "./overview.module.css";

const mask = "••••••••••••••••";

export type SecretRowHandlers = {
  onCreateIn: (environment: string, key: string) => void;
  onDelete: (secret: SecretEntry) => void;
  onUpdateValue: (secret: SecretEntry, value: string) => Promise<unknown>;
  onToggleMultiline: (secret: SecretEntry) => void;
  onSaveOverride: (secret: SecretEntry, value: string, creating: boolean) => Promise<unknown>;
  onRemoveOverride: (secret: SecretEntry) => void;
};

const overlayOf = (secret: SecretEntry): KindOverlay | undefined => {
  if (secret.isRotatedSecret) return "rotation";
  if (secret.isHoneyTokenSecret) return "honey";
  return undefined;
};

const useValue = (
  ctx: RowContext,
  secret: SecretEntry | undefined,
  enabled: boolean,
  isOverride?: boolean
) =>
  useV4Adapter("secrets").useSecretValue(
    {
      projectId: ctx.projectId,
      environment: secret?.env ?? "",
      secretPath: ctx.path,
      secretKey: secret?.key ?? "",
      isOverride
    },
    { enabled: enabled && Boolean(secret) && !secret?.secretValueHidden }
  );

const readValue = (data: ReturnType<typeof useValue>["data"], isOverride?: boolean) =>
  isOverride ? data?.valueOverride : data?.value;

const SecretValue = ({
  ctx,
  secret,
  visible,
  isOverride
}: {
  ctx: RowContext;
  secret?: SecretEntry;
  visible: boolean;
  isOverride?: boolean;
}) => {
  const [focused, setFocused] = useState(false);
  const shown = visible || focused;
  const { data, error } = useValue(ctx, secret, shown, isOverride);
  if (!secret) return <span className={styles.subtle}>Not set in this environment</span>;
  if (secret.secretValueHidden || (shown && error))
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
  const value = readValue(data, isOverride);
  const empty = isOverride ? false : secret.isEmpty;
  return (
    <span
      className={styles.value}
      role="textbox"
      aria-readonly
      tabIndex={0}
      aria-label={`Value of ${secret.key}, focus to reveal`}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {empty && <span className={styles.emptyValue}>Empty</span>}
      {!empty && (shown && value !== undefined ? value : mask)}
    </span>
  );
};

const InlineEditor = ({
  label,
  ctx,
  secret,
  isOverride,
  creating,
  saveLabel,
  undoLabel,
  onSave,
  onCancel
}: {
  label: string;
  ctx: RowContext;
  secret: SecretEntry;
  isOverride?: boolean;
  creating?: boolean;
  saveLabel: string;
  undoLabel: string;
  onSave: (value: string) => Promise<unknown>;
  onCancel: () => void;
}) => {
  const { data } = useValue(ctx, secret, !creating, isOverride);
  const initial = creating ? "" : (readValue(data, isOverride) ?? "");
  const [draft, setDraft] = useState<string>();
  const value = draft ?? initial;
  const root = useRef<HTMLDivElement>(null);
  const dirty = creating || draft !== undefined;
  const save = async () => {
    await onSave(value);
    onCancel();
  };
  return (
    <div ref={root} className={styles.inlineEdit}>
      <Input
        autoFocus
        mono
        className={styles.inlineInput}
        aria-label={label}
        placeholder={isOverride ? "Enter personal override..." : undefined}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && dirty) {
            event.preventDefault();
            save();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={(event) => {
          if (!dirty && !root.current?.contains(event.relatedTarget as Node)) onCancel();
        }}
      />
      {dirty && (
        <span className={styles.quickActions}>
          <Button variant="ghost" size="xs" onClick={onCancel}>
            {undoLabel}
          </Button>
          <Button size="xs" onClick={save}>
            {saveLabel}
          </Button>
        </span>
      )}
    </div>
  );
};

const Indicators = ({ secret }: { secret: SecretEntry }) => {
  const tagCount = secret.tags?.length ?? 0;
  const marks = [
    tagCount > 0 && { icon: TagsIcon, label: `${tagCount} tag${tagCount > 1 ? "s" : ""}` },
    Boolean(secret.secretMetadata?.length) && { icon: CodeXmlIcon, label: "Has metadata" },
    Boolean(secret.reminderRepeatDays || secret.reminder) && {
      icon: BellIcon,
      label: "Has reminder"
    },
    secret.skipMultilineEncoding && { icon: WrapTextIcon, label: "Multi-line encoding disabled" }
  ].filter(Boolean) as { icon: typeof TagsIcon; label: string }[];
  if (!marks.length) return null;
  return (
    <TableRowIndicators>
      {marks.map((mark) => (
        <Tooltip key={mark.label} content={mark.label}>
          <span className={styles.hint}>
            <Icon icon={mark.icon} label={mark.label} />
          </span>
        </Tooltip>
      ))}
    </TableRowIndicators>
  );
};

const useCopyValue = (ctx: RowContext, secret: SecretEntry, isOverride?: boolean) => {
  const [wanted, setWanted] = useState(false);
  const pending = useRef(false);
  const { data, error } = useValue(ctx, secret, wanted, isOverride);
  const value = readValue(data, isOverride);
  const write = (text: string) =>
    copyText(
      text,
      `Copied ${secret.key}${isOverride ? " override" : ""}.`,
      `Could not copy ${secret.key}. Check clipboard permissions.`,
      ctx.report
    );
  useEffect(() => {
    if (!pending.current) return;
    if (value !== undefined) {
      pending.current = false;
      write(value);
    } else if (error) {
      pending.current = false;
      ctx.report(`Could not read ${secret.key}.`);
    }
  });
  return () => {
    if (value !== undefined) {
      write(value);
      return;
    }
    pending.current = true;
    setWanted(true);
  };
};

const SecretActions = ({
  secret,
  ctx,
  handlers,
  onInlineEdit,
  onAddOverride
}: {
  secret: SecretEntry;
  ctx: RowContext;
  handlers: SecretRowHandlers;
  onInlineEdit: () => void;
  onAddOverride: () => void;
}) => {
  const copy = useCopyValue(ctx, secret);
  const pendingAction = useRef<() => void>(undefined);
  let editBlock = ctx.writeBlock;
  if (secret.isHoneyTokenSecret)
    editBlock = "Honey token secrets are managed by Infisical and can't be edited";
  if (secret.isRotatedSecret)
    editBlock = "Rotated secrets are managed by their secret rotation and can't be edited";
  let deleteBlock = ctx.writeBlock;
  if (secret.isHoneyTokenSecret) deleteBlock = "Cannot delete honey token secret";
  if (secret.isRotatedSecret) deleteBlock = "Cannot delete rotated secret";
  let copyBlock: string | undefined;
  if (secret.secretValueHidden) copyBlock = "Access denied";
  else if (secret.isEmpty) copyBlock = "No secret value";
  const later = (label: string, icon: ReactNode) => (
    <DropdownMenuItem disabled description={NOT_PORTED}>
      {icon}
      {label}
    </DropdownMenuItem>
  );
  return (
    <TableRowActions>
      <ActionButton label="Add reminder" icon={BellIcon} disabledReason={NOT_PORTED} />
      <ActionButton
        label="Edit value"
        icon={EditIcon}
        disabledReason={editBlock}
        onClick={onInlineEdit}
      />
      <ActionButton label="Copy secret" name="copy" disabledReason={copyBlock} onClick={copy} />
      <DropdownMenu
        onOpenChange={(next) => {
          const run = pendingAction.current;
          pendingAction.current = undefined;
          if (next || !run) return;
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
        <DropdownMenuContent align="end">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Icon icon={PencilLineIcon} />
              Annotate
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {later(
                secret.comment ? "View comment" : "Add comment",
                <Icon icon={MessageSquareIcon} />
              )}
              {later(secret.tags?.length ? "View tags" : "Add tags", <Icon icon={TagsIcon} />)}
              {later("Add reminder", <Icon icon={BellIcon} />)}
              {later(
                secret.secretMetadata?.length ? "View metadata" : "Add metadata",
                <Icon icon={CodeXmlIcon} />
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Insights</DropdownMenuLabel>
          {later("Secret references", <Icon icon={WorkflowIcon} />)}
          {later("Version history", <Icon name="history" />)}
          {later("View access", <Icon icon={UsersIcon} />)}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Manage</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={Boolean(secret.skipMultilineEncoding)}
            disabled={Boolean(editBlock)}
            onCheckedChange={() => handlers.onToggleMultiline(secret)}
          >
            <Icon icon={WrapTextIcon} />
            Multi-line encoding
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem
            disabled={Boolean(secret.idOverride)}
            description={secret.idOverride ? "Override already exists" : undefined}
            onSelect={() => {
              pendingAction.current = onAddOverride;
            }}
          >
            <Icon icon={GitBranchIcon} />
            Add override
          </DropdownMenuItem>
          {later("Share secret", <Icon icon={ForwardIcon} />)}
          {later("Copy secret", <Icon icon={CopyPlusIcon} />)}
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
  );
};

const OverrideRow = ({
  secret,
  ctx,
  creating,
  visible,
  handlers,
  onStopCreating,
  nameCell
}: {
  secret: SecretEntry;
  ctx: RowContext;
  creating: boolean;
  visible: boolean;
  handlers: SecretRowHandlers;
  onStopCreating: () => void;
  nameCell: ReactNode;
}) => {
  const [editing, setEditing] = useState(false);
  const copy = useCopyValue(ctx, secret, true);
  const block = creating ? "Create the override first" : undefined;
  return (
    <TableRow className={`${styles.row} ${styles.overrideRow}`}>
      <TableCell className={styles.iconCell}>
        <span className={styles.iconSlot}>
          <Icon icon={GitBranchIcon} label="Personal override" />
        </span>
      </TableCell>
      {nameCell}
      <TableCell colSpan={ctx.single ? undefined : 2} className={styles.valueCell}>
        {creating || editing ? (
          <InlineEditor
            label={`Personal override for ${secret.key}`}
            ctx={ctx}
            secret={secret}
            isOverride
            creating={creating}
            saveLabel={creating ? "Create override" : "Save override"}
            undoLabel={creating ? "Cancel override" : "Undo changes"}
            onCancel={() => {
              setEditing(false);
              onStopCreating();
            }}
            onSave={(value) => handlers.onSaveOverride(secret, value, creating)}
          />
        ) : (
          <div
            className={`${styles.nameLine} ${styles.overrideValue}`}
            onDoubleClick={() => setEditing(true)}
          >
            <SecretValue ctx={ctx} secret={secret} visible={visible} isOverride />
          </div>
        )}
      </TableCell>
      <TableActionsCell slots={ROW_ACTION_SLOTS}>
        <RowActions
          label={`${secret.key} override`}
          inline={[
            {
              label: "Edit override",
              icon: EditIcon,
              disabledReason: block,
              onSelect: () => setEditing(true)
            },
            { label: "Copy override", icon: "copy", disabledReason: block, onSelect: copy },
            {
              label: "Remove override",
              icon: "trash",
              disabledReason: block,
              onSelect: () => handlers.onRemoveOverride(secret)
            }
          ]}
        />
      </TableActionsCell>
    </TableRow>
  );
};

export const SecretRow = ({
  row,
  ctx,
  revealAll,
  handlers
}: {
  row: Extract<Row, { kind: "secret" }>;
  ctx: RowContext;
  revealAll: boolean;
  handlers: SecretRowHandlers;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [rowVisible, setRowVisible] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [creatingOverride, setCreatingOverride] = useState<string[]>([]);
  const { entries, name } = row;
  const stopCreating = (environment: string) =>
    setCreatingOverride((current) => current.filter((entry) => entry !== environment));
  const startCreating = (environment: string) =>
    setCreatingOverride((current) => [...current, environment]);
  const valueCell = (secret: SecretEntry | undefined, environment: string, visible: boolean) =>
    secret && editing === environment ? (
      <InlineEditor
        label={`Value of ${name}`}
        ctx={ctx}
        secret={secret}
        saveLabel="Save"
        undoLabel="Undo"
        onCancel={() => setEditing(undefined)}
        onSave={(value) => handlers.onUpdateValue(secret, value)}
      />
    ) : (
      <div className={styles.nameLine}>
        <SecretValue ctx={ctx} secret={secret} visible={visible} />
        {secret && <Indicators secret={secret} />}
      </div>
    );
  if (ctx.single) {
    const first = entries[0];
    const showOverride = Boolean(first.idOverride) || creatingOverride.includes(first.env);
    return (
      <>
        <TableRow className={styles.row}>
          <SelectCell
            kind="secret"
            rowKey={row.key}
            label={name}
            ctx={ctx}
            selectable
            overlay={overlayOf(first)}
          />
          <TableCell
            className={styles.nameCell}
            data-override-rule={Boolean(first.idOverride) || undefined}
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
            {valueCell(first, first.env, revealAll)}
          </TableCell>
          <TableActionsCell slots={ROW_ACTION_SLOTS}>
            <SecretActions
              secret={first}
              ctx={ctx}
              handlers={handlers}
              onInlineEdit={() => setEditing(first.env)}
              onAddOverride={() => startCreating(first.env)}
            />
          </TableActionsCell>
        </TableRow>
        {showOverride && (
          <OverrideRow
            secret={first}
            ctx={ctx}
            creating={creatingOverride.includes(first.env)}
            visible={revealAll}
            handlers={handlers}
            onStopCreating={() => stopCreating(first.env)}
            nameCell={
              <TableCell className={styles.nameCell} data-override-rule>
                <span className={styles.truncate}>{name}</span>
              </TableCell>
            }
          />
        )}
      </>
    );
  }
  const status = (environment: string): EnvironmentStatus => {
    const secret = entries.find((entry) => entry.env === environment);
    if (!secret) return "missing";
    if (secret.secretValueHidden) return "no-access";
    if (secret.isEmpty) return "empty";
    return "present";
  };
  return (
    <>
      <TableRow
        className={`${styles.row} ${styles.clickable}`}
        data-expanded={expanded || undefined}
        onClick={() => setExpanded(!expanded)}
      >
        <SelectCell
          kind="secret"
          rowKey={row.key}
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
                (entry) => entry.env === environment.value && Boolean(entry.idOverride)
              )}
            />
          )
        )}
        <TableActionsCell slots={ROW_ACTION_SLOTS}>
          <RowActions
            label={name}
            inline={[
              {
                label: "Copy secret name",
                icon: "copy",
                onSelect: () =>
                  copyText(
                    name,
                    `Copied the name ${name}.`,
                    "Could not copy the name. Check clipboard permissions.",
                    ctx.report
                  )
              },
              {
                label: "Edit secret name",
                icon: EditIcon,
                disabledReason: NOT_PORTED,
                onSelect: () => undefined
              }
            ]}
          />
        </TableActionsCell>
      </TableRow>
      {expanded && (
        <TableRow className={styles.nestedRow}>
          <TableCell colSpan={ctx.environments.length + 3} className={styles.nestedCell}>
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
                  <TableActionsHead slots={ROW_ACTION_SLOTS} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ctx.environments.flatMap((environment) => {
                  const secret = entries.find((entry) => entry.env === environment.value);
                  const rows = [
                    <TableRow key={environment.value} className={styles.row}>
                      <TableCell className={styles.iconCell} />
                      <TableCell
                        className={styles.envName}
                        data-override-rule={Boolean(secret?.idOverride) || undefined}
                      >
                        <span className={styles.nameLine}>
                          <span className={styles.truncate}>{environment.label}</span>
                          {secret?.isRotatedSecret && (
                            <Icon name="sync" size={12} label="Rotated secret" />
                          )}
                          {secret?.isHoneyTokenSecret && (
                            <Icon icon={HexagonIcon} size={12} label="Honey token secret" />
                          )}
                        </span>
                      </TableCell>
                      <TableCell colSpan={2} className={styles.valueCell}>
                        {valueCell(secret, environment.value, rowVisible)}
                      </TableCell>
                      <TableActionsCell slots={ROW_ACTION_SLOTS}>
                        {secret ? (
                          <SecretActions
                            secret={secret}
                            ctx={ctx}
                            handlers={handlers}
                            onInlineEdit={() => setEditing(environment.value)}
                            onAddOverride={() => startCreating(environment.value)}
                          />
                        ) : (
                          <RowActions
                            label={`${name} in ${environment.label}`}
                            inline={[
                              {
                                label: "Add value",
                                icon: EditIcon,
                                disabledReason: ctx.writeBlock,
                                onSelect: () => handlers.onCreateIn(environment.value, name)
                              }
                            ]}
                          />
                        )}
                      </TableActionsCell>
                    </TableRow>
                  ];
                  if (secret && (secret.idOverride || creatingOverride.includes(environment.value)))
                    rows.push(
                      <OverrideRow
                        key={`${environment.value}-override`}
                        secret={secret}
                        ctx={ctx}
                        creating={creatingOverride.includes(environment.value)}
                        visible={rowVisible}
                        handlers={handlers}
                        onStopCreating={() => stopCreating(environment.value)}
                        nameCell={
                          <TableCell className={styles.envName} data-override-rule>
                            <span className={styles.truncate}>Personal override</span>
                          </TableCell>
                        }
                      />
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
};
