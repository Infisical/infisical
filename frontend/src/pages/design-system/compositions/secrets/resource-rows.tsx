import { type ReactNode, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ActivityIcon,
  BanIcon,
  EditIcon,
  FileKeyIcon,
  FolderInputIcon,
  HandshakeIcon,
  LayersIcon,
  ListIcon,
  TriangleAlertIcon,
  UsersIcon,
  XIcon
} from "lucide-react";

import { Badge, type BadgeTone } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { Icon } from "@app/components/v4/ui/icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  TableRowIndicators
} from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import {
  environments,
  readableValue,
  type Resource,
  type ResourceKind,
  type Secret
} from "../secrets-model";
import {
  ActionButton,
  ExpandToggle,
  PendingActions,
  PendingBadge,
  presenceOf,
  type RowContext,
  SelectCell,
  StatusCell
} from "./overview-cells";
import { canReconcile } from "./row-actions/rotation-actions";

import styles from "./overview.module.css";

type Of<K extends ResourceKind> = Extract<Resource, { kind: K }>;
const mask = "••••••••••••••••";
const tone = (value: string): BadgeTone =>
  (
    {
      active: "ok",
      triggered: "bad",
      revoked: "soft"
    } as Record<string, BadgeTone>
  )[value] ?? "soft";

function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip content={text}>
      <span className={styles.hint}>
        <Icon name="info" size={12} label={text} />
      </span>
    </Tooltip>
  );
}

function RotationStatus({ rotation }: { rotation: Of<"rotation"> }) {
  if (rotation.status === "failed")
    return (
      <Tooltip content="Failure reason: simulated provider error in this preview.">
        <Badge tone="bad">
          <Icon icon={XIcon} />
          Rotation failed
        </Badge>
      </Tooltip>
    );
  if (!rotation.autoRotation)
    return (
      <Badge tone="soft">
        <Icon icon={XIcon} />
        Auto-rotation disabled
      </Badge>
    );
  const next = rotation.nextRotationAt ? new Date(rotation.nextRotationAt) : undefined;
  const days = next ? (next.getTime() - Date.now()) / 86400000 : 0;
  return (
    <Badge tone={days >= 7 ? "info" : "warn"}>
      <Icon name="sync" />
      {days < 0 || !next ? "Rotating" : `Rotates ${formatDistanceToNow(next, { addSuffix: true })}`}
    </Badge>
  );
}

type Spec = {
  label: (entry: Resource) => ReactNode;
  details: (entry: Resource) => ReactNode;
  flag?: (entries: Resource[]) => ReactNode;
  actions: (entry: Resource, ctx: RowContext) => ReactNode;
};
const specs: Record<Exclude<ResourceKind, "secret" | "folder" | "import">, Spec> = {
  dynamic: {
    label: (entry) => entry.name,
    details: (entry) => {
      const item = entry as Of<"dynamic">;
      return (
        <>
          <Badge tone="outline">{item.provider}</Badge>
          {item.status && (
            <Tooltip content="Simulated provider error while deleting leases.">
              <Badge tone={item.status === "deleting" ? "warn" : "bad"}>
                <Icon icon={TriangleAlertIcon} />
                {item.status === "deleting" ? "Revoking" : "Deletion failed"}
              </Badge>
            </Tooltip>
          )}
        </>
      );
    },
    flag: (entries) =>
      entries.some((entry) => entry.kind === "dynamic" && entry.status) && (
        <Tooltip content="One or more dynamic secrets have issues.">
          <Badge tone="bad">
            <Icon icon={XIcon} />
            Deletion failed
          </Badge>
        </Tooltip>
      ),
    actions: (entry, ctx) => {
      const item = entry as Of<"dynamic">;
      const run = (action: "leases" | "lease" | "edit" | "delete" | "force-delete") => () =>
        ctx.onAction({ kind: "dynamic", action, entry: item });
      const block =
        ctx.writeBlock ??
        (item.status === "deleting" ? "Dynamic secret is being revoked" : undefined);
      return (
        <>
          <ActionButton
            label="View leases"
            icon={ListIcon}
            disabledReason={block}
            onClick={run("leases")}
          />
          <ActionButton
            label="Generate lease"
            icon={FileKeyIcon}
            disabledReason={block}
            onClick={run("lease")}
          />
          <ActionButton label="Edit" icon={EditIcon} disabledReason={block} onClick={run("edit")} />
          {item.status === "failed-deletion" && (
            <ActionButton
              label="Force delete"
              icon={XIcon}
              disabledReason={ctx.writeBlock}
              onClick={run("force-delete")}
            />
          )}
          <ActionButton
            label="Delete"
            name="trash"
            disabledReason={block}
            onClick={run("delete")}
          />
        </>
      );
    }
  },
  rotation: {
    label: (entry) => entry.name,
    details: (entry) => {
      const item = entry as Of<"rotation">;
      return (
        <>
          <Badge tone="outline">{item.provider}</Badge>
          {item.description && <InfoHint text={item.description} />}
          <span className={styles.push}>
            <RotationStatus rotation={item} />
          </span>
        </>
      );
    },
    flag: (entries) =>
      entries.some((entry) => entry.kind === "rotation" && entry.status === "failed") && (
        <Tooltip content="One or more secrets failed to rotate.">
          <Badge tone="bad">
            <Icon icon={XIcon} />
            Rotation failed
          </Badge>
        </Tooltip>
      ),
    actions: (entry, ctx) => {
      const item = entry as Of<"rotation">;
      const run =
        (action: "validate" | "credentials" | "rotate" | "reconcile" | "edit" | "delete") => () =>
          ctx.onAction({ kind: "rotation", action, entry: item });
      return (
        <>
          <ActionButton
            label="Validate credentials"
            icon={ActivityIcon}
            disabledReason={ctx.writeBlock}
            onClick={run("validate")}
          />
          <ActionButton
            label="View generated credentials"
            name="eye"
            disabledReason={ctx.writeBlock}
            onClick={run("credentials")}
          />
          <ActionButton
            label="Rotate secret"
            name="sync"
            disabledReason={ctx.writeBlock}
            onClick={run("rotate")}
          />
          {canReconcile(item) && (
            <ActionButton
              label="Reconcile secret"
              icon={HandshakeIcon}
              disabledReason={ctx.writeBlock}
              onClick={run("reconcile")}
            />
          )}
          <ActionButton
            label="Edit"
            icon={EditIcon}
            disabledReason={ctx.writeBlock}
            onClick={run("edit")}
          />
          <ActionButton
            label="Delete"
            name="trash"
            disabledReason={ctx.writeBlock}
            onClick={run("delete")}
          />
        </>
      );
    }
  },
  honey: {
    label: (entry) => entry.name,
    details: (entry) => {
      const item = entry as Of<"honey">;
      return (
        <>
          <Badge tone="outline">{item.provider} honey token</Badge>
          {item.mappedKeys.length > 0 && (
            <InfoHint text={`Mapped secrets: ${item.mappedKeys.join(", ")}`} />
          )}
          <span className={styles.push}>
            <Badge tone={tone(item.status)}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Badge>
          </span>
        </>
      );
    },
    actions: (entry, ctx) => {
      const item = entry as Of<"honey">;
      const run = (action: "details" | "edit" | "revoke") => () =>
        ctx.onAction({ kind: "honey", action, entry: item });
      return (
        <>
          <ActionButton label="View details" icon={ListIcon} onClick={run("details")} />
          {item.status === "revoked" ? (
            <ActionButton
              label={`More actions unavailable for ${item.name}`}
              name="more"
              disabledReason="Revoked honey tokens cannot be edited."
            />
          ) : (
            <DropdownMenu>
              <Tooltip content={`More actions for ${item.name}`}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-row"
                    iconOnly
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Icon name="more" />
                    <span className="sr-only">{`More actions for ${item.name}`}</span>
                  </Button>
                </DropdownMenuTrigger>
              </Tooltip>
              <DropdownMenuContent align="end" onCloseAutoFocus={(event) => event.preventDefault()}>
                <DropdownMenuItem
                  disabled={Boolean(ctx.writeBlock)}
                  description={ctx.writeBlock}
                  onSelect={run("edit")}
                >
                  <Icon icon={EditIcon} />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={Boolean(ctx.writeBlock)}
                  description={ctx.writeBlock}
                  variant="destructive"
                  onSelect={run("revoke")}
                >
                  <Icon name="alert" />
                  Revoke
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      );
    }
  },
  proxy: {
    label: (entry) => entry.name,
    details: (entry) => {
      const item = entry as Of<"proxy">;
      return (
        <>
          <span className={styles.subtle} title={item.host}>
            {item.host}
          </span>
          <span className={styles.push}>
            {!item.enabled && (
              <Badge tone="outline">
                <Icon icon={BanIcon} />
                Disabled
              </Badge>
            )}
            {item.lastUsedAt && (
              <Tooltip content={new Date(item.lastUsedAt).toLocaleString("en-US")}>
                <span className={styles.subtle}>
                  Used {formatDistanceToNow(new Date(item.lastUsedAt), { addSuffix: true })}
                </span>
              </Tooltip>
            )}
          </span>
        </>
      );
    },
    actions: (entry, ctx) => {
      const item = entry as Of<"proxy">;
      return (
        <>
          <ActionButton
            label="Edit"
            icon={EditIcon}
            disabledReason={ctx.writeBlock}
            onClick={() => ctx.onAction({ kind: "proxy", action: "edit", entry: item })}
          />
          <ActionButton
            label="Delete"
            name="trash"
            disabledReason={ctx.writeBlock}
            onClick={() => ctx.onAction({ kind: "proxy", action: "delete", entry: item })}
          />
        </>
      );
    }
  }
};

function EnvironmentTable({
  ctx,
  entries,
  render,
  valueHeader
}: {
  ctx: RowContext;
  entries: Resource[];
  render: (entry: Resource) => ReactNode;
  valueHeader?: ReactNode;
}) {
  return (
    <TableRow className={styles.nestedRow}>
      <TableCell colSpan={ctx.environments.length + 2} className={styles.nestedCell}>
        <Table className={styles.nestedTable}>
          <TableHeader>
            <TableRow>
              <TableHead className={styles.iconCell} />
              <TableHead className={styles.envName}>Environment</TableHead>
              <TableHead>{valueHeader}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ctx.environments
              .filter((environment) =>
                entries.some((entry) => entry.environment === environment.value)
              )
              .map((environment) => {
                const entry = entries.find((item) => item.environment === environment.value)!;
                return (
                  <TableRow key={environment.value} className={styles.row}>
                    <TableCell className={styles.iconCell} />
                    <TableCell className={styles.envName}>{environment.label}</TableCell>
                    <TableCell className={styles.nameCell}>{render(entry)}</TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </TableCell>
    </TableRow>
  );
}

export function KindRow({
  kind,
  rowKey,
  entries,
  ctx
}: {
  kind: keyof typeof specs;
  rowKey: string;
  entries: Resource[];
  ctx: RowContext;
}) {
  const [expanded, setExpanded] = useState(false);
  const spec = specs[kind];
  const first = entries[0];
  const line = (entry: Resource, withName: boolean) => (
    <div className={styles.nameLine}>
      {withName && <span className={styles.truncate}>{spec.label(entry)}</span>}
      {spec.details(entry)}
      <TableRowActions reveal>{spec.actions(entry, ctx)}</TableRowActions>
    </div>
  );
  if (ctx.single)
    return (
      <TableRow
        data-state={ctx.recent.includes(rowKey) ? "selected" : undefined}
        className={styles.row}
      >
        <SelectCell
          kind={kind}
          rowKey={rowKey}
          label={first.name}
          ctx={ctx}
          selectable={kind === "rotation"}
        />
        <TableCell colSpan={2} className={styles.nameCell}>
          {line(first, true)}
        </TableCell>
      </TableRow>
    );
  return (
    <>
      <TableRow
        data-state={ctx.recent.includes(rowKey) ? "selected" : undefined}
        className={styles.row}
        data-expanded={expanded || undefined}
        onClick={() => setExpanded(!expanded)}
      >
        <SelectCell
          kind={kind}
          rowKey={rowKey}
          label={first.name}
          ctx={ctx}
          selectable={false}
          pinned={expanded}
          alternate={
            <ExpandToggle
              expanded={expanded}
              label={first.name}
              onToggle={() => setExpanded(!expanded)}
            />
          }
        />
        <TableCell className={styles.nameCell}>
          <div className={styles.nameLine}>
            <span className={styles.truncate}>{first.name}</span>
            {!expanded && <span className={styles.push}>{spec.flag?.(entries)}</span>}
          </div>
        </TableCell>
        {ctx.environments.map((environment) =>
          expanded ? (
            <TableCell key={environment.value} />
          ) : (
            <StatusCell key={environment.value} status={presenceOf(entries, environment.value)} />
          )
        )}
      </TableRow>
      {expanded && (
        <EnvironmentTable ctx={ctx} entries={entries} render={(entry) => line(entry, false)} />
      )}
    </>
  );
}

export function FolderRow({
  rowKey,
  entries,
  ctx,
  onOpen,
  onEdit,
  onDelete
}: {
  rowKey: string;
  entries: Of<"folder">[];
  ctx: RowContext;
  onOpen: () => void;
  onEdit: (folder: Of<"folder">) => void;
  onDelete: (folder: Of<"folder">) => void;
}) {
  const first = entries[0];
  return (
    <TableRow
      data-state={ctx.recent.includes(rowKey) ? "selected" : undefined}
      data-pending={ctx.pending?.[first.id]}
      className={`${styles.row} ${styles.clickable}`}
      onClick={onOpen}
    >
      <SelectCell kind="folder" rowKey={rowKey} label={first.name} ctx={ctx} selectable />
      <TableCell colSpan={ctx.single ? 2 : undefined} className={styles.nameCell}>
        <div className={styles.nameLine}>
          <span className={styles.truncate} title={first.name}>
            {first.name}
          </span>
          {first.description && <InfoHint text={first.description} />}
          <PendingBadge type={ctx.pending?.[first.id]} />
          <TableRowActions reveal>
            <PendingActions id={first.id} ctx={ctx} />
            <ActionButton
              label="Move folder"
              icon={FolderInputIcon}
              disabledReason={ctx.writeBlock}
              onClick={() =>
                ctx.onAction({ kind: "folder", action: "move", entry: first, entries })
              }
            />
            <ActionButton
              label="Edit folder"
              icon={EditIcon}
              disabledReason={ctx.writeBlock}
              onClick={() => onEdit(first)}
            />
            <ActionButton
              label="Manage access"
              icon={UsersIcon}
              disabledReason={
                ctx.single ? ctx.writeBlock : "Select a single environment to manage folder access."
              }
              onClick={() =>
                ctx.onAction({ kind: "folder", action: "access", entry: first, entries })
              }
            />
            <ActionButton
              label="Delete folder"
              name="trash"
              disabledReason={ctx.writeBlock}
              onClick={() => onDelete(first)}
            />
          </TableRowActions>
        </div>
      </TableCell>
      {!ctx.single &&
        ctx.environments.map((environment) => (
          <StatusCell key={environment.value} status={presenceOf(entries, environment.value)} />
        ))}
    </TableRow>
  );
}

export function ImportRow({
  rowKey,
  entries,
  ctx,
  sourceSecrets,
  projectName
}: {
  rowKey: string;
  entries: Of<"import">[];
  ctx: RowContext;
  sourceSecrets: (entry: Of<"import">) => Secret[];
  projectName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const first = entries[0];
  const label = (
    <span className={styles.importLabel}>
      {first.source.project !== projectName && <Badge tone="warn">{first.source.project}</Badge>}
      <Badge tone="outline">
        <Icon icon={LayersIcon} />
        {environments.find((environment) => environment.value === first.source.environment)
          ?.label ?? first.source.environment}
      </Badge>
      <Icon name="folder" size={14} />
      <span className={styles.truncate}>{first.source.path}</span>
    </span>
  );
  const replication = (entry: Of<"import">) =>
    entry.replicated &&
    entry.lastReplicated && (
      <Tooltip
        content={`Last replication ${new Date(entry.lastReplicated).toLocaleString("en-US")}${entry.replicationStatus === "failed" ? ". Fail reason: simulated replication error." : ""}`}
      >
        <span
          className={styles.hint}
          data-tone={entry.replicationStatus === "failed" ? "bad" : undefined}
        >
          <Icon
            icon={entry.replicationStatus === "failed" ? TriangleAlertIcon : undefined}
            name={entry.replicationStatus === "failed" ? undefined : "info"}
            label="Replication status"
          />
        </span>
      </Tooltip>
    );
  const actions = (entry: Of<"import">) => (
    <TableRowActions reveal>
      {entry.replicated && (
        <ActionButton
          label="Resync"
          name="sync"
          disabledReason={ctx.writeBlock}
          onClick={() => ctx.onAction({ kind: "import", action: "resync", entry })}
        />
      )}
      <ActionButton
        label="Delete"
        name="trash"
        disabledReason={ctx.writeBlock}
        onClick={() => ctx.onAction({ kind: "import", action: "delete", entry })}
      />
    </TableRowActions>
  );
  const toggle = (
    <ExpandToggle
      expanded={expanded}
      label={`secret import ${first.source.path}`}
      onToggle={() => setExpanded(!expanded)}
    />
  );
  const keys = ctx.single && expanded ? sourceSecrets(first) : [];
  return (
    <>
      <TableRow
        data-state={ctx.recent.includes(rowKey) ? "selected" : undefined}
        className={`${styles.row} ${styles.clickable}`}
        data-expanded={expanded || undefined}
        onClick={() => setExpanded(!expanded)}
      >
        <SelectCell
          kind="import"
          rowKey={rowKey}
          label={first.name}
          ctx={ctx}
          selectable={false}
          pinned={expanded}
          alternate={toggle}
        />
        <TableCell colSpan={ctx.single ? 2 : undefined} className={styles.nameCell}>
          <div className={styles.nameLine}>
            {label}
            {first.revoked && (
              <span className={styles.push}>
                <Badge tone="bad">
                  <Icon icon={XIcon} />
                  Secret share revoked
                </Badge>
              </span>
            )}
            {ctx.single && <TableRowIndicators>{replication(first)}</TableRowIndicators>}
            {ctx.single && actions(first)}
          </div>
        </TableCell>
        {!ctx.single &&
          ctx.environments.map((environment) =>
            expanded ? (
              <TableCell key={environment.value} />
            ) : (
              <StatusCell key={environment.value} status={presenceOf(entries, environment.value)} />
            )
          )}
      </TableRow>
      {ctx.single && expanded && !first.revoked && (
        <TableRow className={styles.nestedHead}>
          <TableCell className={styles.iconCell} />
          <TableCell className={styles.nameCell}>Name</TableCell>
          <TableCell className={styles.valueCell}>Value</TableCell>
        </TableRow>
      )}
      {ctx.single &&
        keys.map((secret) => (
          <TableRow key={secret.id} className={styles.importedRow}>
            <TableCell className={styles.iconCell} />
            <TableCell className={styles.nameCell}>
              <span className={styles.truncate}>{secret.name}</span>
            </TableCell>
            <TableCell className={styles.valueCell}>
              <code className={styles.value}>
                {readableValue(secret) === undefined ? "No access" : mask}
              </code>
            </TableCell>
          </TableRow>
        ))}
      {ctx.single && expanded && first.revoked && (
        <TableRow className={styles.importedRow}>
          <TableCell className={styles.iconCell} />
          <TableCell colSpan={2} className={styles.subtle}>
            Access to this source was revoked, so its secrets are not shown.
          </TableCell>
        </TableRow>
      )}
      {!ctx.single && expanded && (
        <TableRow className={styles.nestedRow}>
          <TableCell colSpan={ctx.environments.length + 2} className={styles.nestedCell}>
            <div className={styles.importedIn}>
              <span className={styles.subtle}>Imported in:</span>
              {entries.map((entry) => (
                <Badge key={entry.id} tone="outline">
                  <Icon icon={LayersIcon} />
                  {environments.find((environment) => environment.value === entry.environment)
                    ?.label ?? entry.environment}
                </Badge>
              ))}
              <span className={styles.push}>
                <span className={styles.hint} data-tone="info">
                  <Icon name="info" size={12} />
                </span>
                <span className={styles.subtle}>Select a single environment to manage imports</span>
              </span>
            </div>
            <Table className={styles.nestedTable}>
              <TableHeader>
                <TableRow>
                  <TableHead className={styles.iconCell} />
                  <TableHead className={styles.envName}>Name</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {first.revoked ? (
                  <TableRow>
                    <TableCell className={styles.iconCell} />
                    <TableCell colSpan={2} className={styles.subtle}>
                      Access to this source was revoked, so its secrets are not shown.
                    </TableCell>
                  </TableRow>
                ) : (
                  sourceSecrets(first).map((secret) => (
                    <TableRow key={secret.id} className={styles.row}>
                      <TableCell className={styles.iconCell} />
                      <TableCell className={styles.envName}>
                        <span className={styles.truncate}>{secret.name}</span>
                      </TableCell>
                      <TableCell className={styles.valueCell}>
                        <code className={styles.value}>
                          {readableValue(secret) === undefined ? "No access" : mask}
                        </code>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export const kindRowKinds = Object.keys(specs) as (keyof typeof specs)[];
