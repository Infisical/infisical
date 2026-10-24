import { useState } from "react";
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

import { Button } from "@app/components/v4/ui/button";
import {
  DropdownMenu,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { readableValue, type Secret } from "../secrets-model";
import {
  ActionBar,
  ActionButton,
  type EnvironmentStatus,
  ExpandToggle,
  type KindOverlay,
  NEXT_PHASE,
  type RowContext,
  SelectCell,
  StatusCell
} from "./overview-cells";

import styles from "./overview.module.css";

const mask = "••••••••••••••••";
const overlayOf = (secret: Secret): KindOverlay | undefined => {
  if (secret.managedBy) return "rotation";
  if (secret.honeyToken) return "honey";
  return undefined;
};
export type SecretRowHandlers = {
  onEdit: (secret: Secret) => void;
  onCreateIn: (environment: string, key: string) => void;
  onDelete: (secret: Secret) => void;
  importedFrom: (environment: string, key: string) => string | undefined;
};

function SecretValue({ secret, visible }: { secret?: Secret; visible: boolean }) {
  const [focused, setFocused] = useState(false);
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
      {value !== "" && (visible || focused ? value : mask)}
    </span>
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
    <span className={styles.indicators}>
      {marks.map((mark) => (
        <Tooltip key={mark.label} content={mark.label}>
          <span className={styles.hint}>
            <Icon icon={mark.icon} label={mark.label} />
          </span>
        </Tooltip>
      ))}
    </span>
  );
}

function SecretActions({
  secret,
  ctx,
  handlers,
  report
}: {
  secret: Secret;
  ctx: RowContext;
  handlers: SecretRowHandlers;
  report: (message: string) => void;
}) {
  const value = readableValue(secret);
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
  return (
    <ActionBar>
      {secret.tags.length > 0 && (
        <ActionButton label="View tags" icon={TagsIcon} disabledReason={NEXT_PHASE} />
      )}
      {secret.reminder && (
        <ActionButton label="View reminder" icon={BellIcon} disabledReason={NEXT_PHASE} />
      )}
      {secret.metadata.length > 0 && (
        <ActionButton label="View metadata" icon={CodeXmlIcon} disabledReason={NEXT_PHASE} />
      )}
      <ActionButton
        label="Edit value"
        icon={EditIcon}
        disabledReason={editBlock}
        onClick={() => handlers.onEdit(secret)}
      />
      <ActionButton
        label="Copy secret"
        name="copy"
        disabledReason={copyBlock}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value ?? "");
            report(`Copied ${secret.name}.`);
          } catch {
            report(`Could not copy ${secret.name}. Check clipboard permissions.`);
          }
        }}
      />
      <DropdownMenu>
        <Tooltip content="Secret actions">
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
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
              {[
                { icon: MessageSquareIcon, label: secret.comment ? "View comment" : "Add comment" },
                { icon: TagsIcon, label: secret.tags.length ? "View tags" : "Add tags" },
                { icon: BellIcon, label: secret.reminder ? "View reminder" : "Add reminder" },
                {
                  icon: CodeXmlIcon,
                  label: secret.metadata.length ? "View metadata" : "Add metadata"
                }
              ].map((item) => (
                <DropdownMenuItem key={item.label} disabled description={NEXT_PHASE}>
                  <Icon icon={item.icon} />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Insights</DropdownMenuLabel>
          {[
            { icon: WorkflowIcon, label: "Secret references" },
            { icon: undefined, label: "Version history", name: "history" as const },
            { icon: UsersIcon, label: "View access" }
          ].map((item) => (
            <DropdownMenuItem key={item.label} disabled description={NEXT_PHASE}>
              <Icon icon={item.icon} name={item.name} />
              {item.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Manage</DropdownMenuLabel>
          {[
            { icon: WrapTextIcon, label: "Multi-line encoding" },
            { icon: GitBranchIcon, label: "Add override" },
            { icon: ForwardIcon, label: "Share secret" },
            { icon: CopyPlusIcon, label: "Copy secret" }
          ].map((item) => (
            <DropdownMenuItem key={item.label} disabled description={NEXT_PHASE}>
              <Icon icon={item.icon} />
              {item.label}
            </DropdownMenuItem>
          ))}
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
    </ActionBar>
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
  const first = entries[0];
  const { name } = first;
  if (ctx.single)
    return (
      <>
        <TableRow className={styles.row}>
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
              <SecretValue secret={first} visible={revealAll} />
              <span className={styles.push}>
                <Indicators secret={first} />
              </span>
              <SecretActions secret={first} ctx={ctx} handlers={handlers} report={ctx.report} />
            </div>
          </TableCell>
        </TableRow>
        {first.override !== undefined && (
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
              <div className={styles.nameLine}>
                <code className={styles.value}>{revealAll ? first.override || " " : mask}</code>
                <span className={styles.persistentActions}>
                  <ActionButton
                    label="Copy override"
                    name="copy"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(first.override ?? "");
                        ctx.report("Personal override copied to clipboard.");
                      } catch {
                        ctx.report("Could not copy the override. Check clipboard permissions.");
                      }
                    }}
                  />
                  <ActionButton label="Delete override" name="trash" disabledReason={NEXT_PHASE} />
                </span>
              </div>
            </TableCell>
          </TableRow>
        )}
      </>
    );
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
            <ActionBar>
              <ActionButton
                label="Copy secret name"
                name="copy"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(name);
                    ctx.report(`Copied the name ${name}.`);
                  } catch {
                    ctx.report("Could not copy the name. Check clipboard permissions.");
                  }
                }}
              />
              <ActionButton label="Edit secret name" icon={EditIcon} disabledReason={NEXT_PHASE} />
            </ActionBar>
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
                {ctx.environments.map((environment) => {
                  const secret = entries.find((entry) => entry.environment === environment.value);
                  const imported = handlers.importedFrom(environment.value, name);
                  return (
                    <TableRow key={environment.value} className={styles.row}>
                      <TableCell className={styles.iconCell} />
                      <TableCell className={styles.envName}>
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
                        <div className={styles.nameLine}>
                          <SecretValue secret={secret} visible={rowVisible} />
                          {secret && (
                            <span className={styles.push}>
                              <Indicators secret={secret} />
                            </span>
                          )}
                          {secret ? (
                            <SecretActions
                              secret={secret}
                              ctx={ctx}
                              handlers={handlers}
                              report={ctx.report}
                            />
                          ) : (
                            <ActionBar>
                              <ActionButton
                                label="Add value"
                                icon={EditIcon}
                                disabledReason={ctx.writeBlock}
                                onClick={() => handlers.onCreateIn(environment.value, name)}
                              />
                            </ActionBar>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
