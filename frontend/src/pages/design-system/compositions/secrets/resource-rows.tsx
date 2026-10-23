import { type ReactNode, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ActivityIcon,
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
  TableRow
} from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { readableValue, type Resource, type ResourceKind, type Secret } from "../secrets-model";
import {
  ActionBar,
  ActionButton,
  ExpandToggle,
  NEXT_PHASE,
  presenceOf,
  type RowContext,
  SelectCell,
  StatusCell
} from "./overview-cells";

import styles from "./overview.module.css";

type Of<K extends ResourceKind> = Extract<Resource, { kind: K }>;
const mask = "••••••••••••••••";
const tone = (value: string): BadgeTone =>
  (
    ({
      active: "ok",
      triggered: "bad",
      revoked: "soft"
    }) as Record<string, BadgeTone>
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
  actions: (entry: Resource) => ReactNode;
};
const specs: Record<Exclude<ResourceKind, "secret" | "folder" | "import">, Spec> = {
  dynamic: {
    label: (entry) => entry.name,
    details: (entry) => {
      const item = entry as Of<"dynamic">;
      return (
        <>
          <Badge tone="soft">{item.provider}</Badge>
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
    actions: (entry) => (
      <>
        <ActionButton label="View leases" icon={ListIcon} disabledReason={NEXT_PHASE} />
        <ActionButton label="Generate lease" icon={FileKeyIcon} disabledReason={NEXT_PHASE} />
        <ActionButton label="Edit" icon={EditIcon} disabledReason={NEXT_PHASE} />
        {entry.kind === "dynamic" && entry.status === "failed-deletion" && (
          <ActionButton label="Force delete" icon={XIcon} disabledReason={NEXT_PHASE} />
        )}
        <ActionButton label="Delete" name="trash" disabledReason={NEXT_PHASE} />
      </>
    )
  },
  rotation: {
    label: (entry) => entry.name,
    details: (entry) => {
      const item = entry as Of<"rotation">;
      return (
        <>
          <Badge tone="soft">{item.provider}</Badge>
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
    actions: () => (
      <>
        <ActionButton
          label="Validate credentials"
          icon={ActivityIcon}
          disabledReason={NEXT_PHASE}
        />
        <ActionButton label="View generated credentials" name="eye" disabledReason={NEXT_PHASE} />
        <ActionButton label="Rotate secret" name="sync" disabledReason={NEXT_PHASE} />
        <ActionButton label="Reconcile secret" icon={HandshakeIcon} disabledReason={NEXT_PHASE} />
        <ActionButton label="Edit" icon={EditIcon} disabledReason={NEXT_PHASE} />
        <ActionButton label="Delete" name="trash" disabledReason={NEXT_PHASE} />
      </>
    )
  },
  honey: {
    label: (entry) => entry.name,
    details: (entry) => {
      const item = entry as Of<"honey">;
      return (
        <>
          <Badge tone="soft">{item.provider} honey token</Badge>
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
    actions: (entry) => (
      <>
        <ActionButton label="View details" icon={ListIcon} disabledReason={NEXT_PHASE} />
        <DropdownMenu>
          <Tooltip content={`More actions for ${entry.name}`}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                iconOnly
                onClick={(event) => event.stopPropagation()}
              >
                <Icon name="more" />
                <span className="sr-only">{`More actions for ${entry.name}`}</span>
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled description={NEXT_PHASE}>
              <Icon icon={EditIcon} />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem disabled variant="destructive" description={NEXT_PHASE}>
              <Icon name="alert" />
              Revoke
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    )
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
              <Badge tone="soft">
                <Icon icon={XIcon} />
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
    actions: () => (
      <>
        <ActionButton label="Edit" icon={EditIcon} disabledReason={NEXT_PHASE} />
        <ActionButton label="Delete" name="trash" disabledReason={NEXT_PHASE} />
      </>
    )
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
      <ActionBar>{spec.actions(entry)}</ActionBar>
    </div>
  );
  if (ctx.single)
    return (
      <TableRow className={styles.row}>
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
    <TableRow className={`${styles.row} ${styles.clickable}`} onClick={onOpen}>
      <SelectCell kind="folder" rowKey={rowKey} label={first.name} ctx={ctx} selectable />
      <TableCell colSpan={ctx.single ? 2 : undefined} className={styles.nameCell}>
        <div className={styles.nameLine}>
          <span className={styles.truncate} title={first.name}>
            {first.name}
          </span>
          {first.description && <InfoHint text={first.description} />}
          <ActionBar>
            <ActionButton label="Move folder" icon={FolderInputIcon} disabledReason={NEXT_PHASE} />
            <ActionButton
              label="Edit folder"
              icon={EditIcon}
              disabledReason={
                ctx.single ? ctx.writeBlock : "Expand to a single environment to edit."
              }
              onClick={() => onEdit(first)}
            />
            <ActionButton label="Manage access" icon={UsersIcon} disabledReason={NEXT_PHASE} />
            <ActionButton
              label="Delete folder"
              name="trash"
              disabledReason={
                ctx.single ? ctx.writeBlock : "Select a single environment to delete."
              }
              onClick={() => onDelete(first)}
            />
          </ActionBar>
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
      <Badge tone="soft">
        <Icon icon={LayersIcon} />
        {first.source.environment}
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
    <ActionBar>
      {entry.replicated && <ActionButton label="Resync" name="sync" disabledReason={NEXT_PHASE} />}
      <ActionButton label="Delete" name="trash" disabledReason={NEXT_PHASE} />
    </ActionBar>
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
            {ctx.single && <span className={styles.push}>{replication(first)}</span>}
            {ctx.single && actions(first)}
          </div>
        </TableCell>
        {!ctx.single &&
          ctx.environments.map((environment) =>
            expanded ? (
              <TableCell key={environment.value} />
            ) : (
              <StatusCell
                key={environment.value}
                status={
                  entries.some((entry) => entry.environment === environment.value)
                    ? "imported"
                    : "missing"
                }
              />
            )
          )}
      </TableRow>
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
        <EnvironmentTable
          ctx={ctx}
          entries={entries}
          render={(entry) => (
            <div className={styles.nameLine}>
              {replication(entry as Of<"import">)}
              {actions(entry as Of<"import">)}
            </div>
          )}
        />
      )}
    </>
  );
}

export const kindRowKinds = Object.keys(specs) as (keyof typeof specs)[];
