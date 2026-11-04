import { type ReactNode, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ActivityIcon,
  BanIcon,
  EditIcon,
  FileKeyIcon,
  FolderInputIcon,
  LayersIcon,
  ListIcon,
  TriangleAlertIcon,
  UsersIcon,
  XIcon
} from "lucide-react";

import { Badge } from "@app/components/v4/ui/badge";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { Icon } from "@app/components/v4/ui/icon";
import {
  type RowAction,
  RowActions,
  type RowActionList,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowIndicators
} from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { HONEY_TOKEN_MAP } from "@app/helpers/honeyTokens";
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { DynamicSecretStatus } from "@app/hooks/api/dynamicSecret/types";
import { SecretRotationStatus } from "@app/hooks/api/secretRotationsV2/enums";

import {
  ExpandToggle,
  InfoHint,
  NOT_PORTED,
  ROW_ACTION_SLOTS,
  type RowContext,
  SelectCell,
  StatusCell
} from "./cells";
import {
  type DynamicEntry,
  environmentOf,
  type FolderEntry,
  type HoneyEntry,
  type ImportEntry,
  type ProxyEntry,
  type RotationEntry,
  type Row
} from "./model";

import styles from "./overview.module.css";

type KindRowType = Extract<Row, { kind: "dynamic" | "rotation" | "honey" | "proxy" }>;
type KindEntry = KindRowType["entries"][number];

const environmentLabel = (ctx: RowContext, slug: string) =>
  ctx.environments.find((environment) => environment.value === slug)?.label ?? slug;

const providerLabel = (type: string) =>
  type === "sql-database"
    ? "SQL Database"
    : type
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

const RotationStatus = ({ rotation }: { rotation: RotationEntry }) => {
  if (rotation.rotationStatus === SecretRotationStatus.Failed)
    return (
      <Tooltip content={`Failure reason: ${rotation.lastRotationMessage ?? "unknown"}`}>
        <Badge tone="bad">
          <Icon icon={XIcon} />
          Rotation failed
        </Badge>
      </Tooltip>
    );
  if (!rotation.isAutoRotationEnabled)
    return (
      <Badge tone="soft">
        <Icon icon={XIcon} />
        Auto-rotation disabled
      </Badge>
    );
  const next = new Date(rotation.nextRotationAt);
  const days = (next.getTime() - Date.now()) / 86400000;
  return (
    <Badge tone={days >= 7 ? "info" : "warn"}>
      <Icon name="sync" />
      {days < 0 ? "Rotating" : `Rotates ${formatDistanceToNow(next, { addSuffix: true })}`}
    </Badge>
  );
};

const later = (label: string, icon: RowAction["icon"]): RowAction => ({
  label,
  icon,
  disabledReason: NOT_PORTED,
  onSelect: () => undefined
});

const details = (row: KindRowType, entry: KindEntry): ReactNode => {
  if (row.kind === "dynamic") {
    const item = entry as DynamicEntry;
    return (
      <>
        <Badge tone="outline">{providerLabel(item.type)}</Badge>
        {item.status && (
          <Tooltip content={item.statusDetails ?? item.status}>
            <Badge tone={item.status === DynamicSecretStatus.Deleting ? "warn" : "bad"}>
              <Icon icon={TriangleAlertIcon} />
              {item.status === DynamicSecretStatus.Deleting ? "Revoking" : "Deletion failed"}
            </Badge>
          </Tooltip>
        )}
      </>
    );
  }
  if (row.kind === "rotation") {
    const item = entry as RotationEntry;
    return (
      <>
        <Badge tone="outline">{SECRET_ROTATION_MAP[item.type].name}</Badge>
        <InfoHint text={`Connection: ${item.connection.name}`} />
        <span className={styles.push}>
          <RotationStatus rotation={item} />
        </span>
      </>
    );
  }
  if (row.kind === "honey") {
    const item = entry as HoneyEntry;
    const keys = Object.values(item.secretsMapping);
    return (
      <>
        <Badge tone="outline">{HONEY_TOKEN_MAP[item.type].name} honey token</Badge>
        {keys.length > 0 && <InfoHint text={`Mapped secrets: ${keys.join(", ")}`} />}
        <span className={styles.push}>
          <Badge tone={{ active: "ok", triggered: "bad", revoked: "soft" }[item.status] as "ok"}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Badge>
        </span>
      </>
    );
  }
  const item = entry as ProxyEntry;
  return (
    <>
      <span className={styles.subtle} title={item.hostPattern}>
        {item.hostPattern}
      </span>
      <span className={styles.push}>
        {!item.isEnabled && (
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
};

const flag = (row: KindRowType) => {
  if (
    row.kind === "dynamic" &&
    row.entries.some((entry) => entry.status === DynamicSecretStatus.FailedDeletion)
  )
    return (
      <Tooltip content="One or more dynamic secrets have issues.">
        <Badge tone="bad">
          <Icon icon={XIcon} />
          Deletion failed
        </Badge>
      </Tooltip>
    );
  if (
    row.kind === "rotation" &&
    row.entries.some((entry) => entry.rotationStatus === SecretRotationStatus.Failed)
  )
    return (
      <Tooltip content="One or more secrets failed to rotate.">
        <Badge tone="bad">
          <Icon icon={XIcon} />
          Rotation failed
        </Badge>
      </Tooltip>
    );
  return null;
};

const inlineActions: Record<KindRowType["kind"], RowActionList> = {
  dynamic: [
    later("View leases", ListIcon),
    later("Generate lease", FileKeyIcon),
    later("Edit", EditIcon)
  ],
  rotation: [
    later("Validate credentials", ActivityIcon),
    later("View generated credentials", "eye"),
    later("Rotate secret", "sync")
  ],
  honey: [later("View details", ListIcon)],
  proxy: [later("Edit", EditIcon), later("Delete", "trash")]
};

const kindMenu: Partial<Record<KindRowType["kind"], ReactNode>> = {
  dynamic: (
    <DropdownMenuItem variant="destructive" disabled description={NOT_PORTED}>
      <Icon name="trash" />
      Delete
    </DropdownMenuItem>
  ),
  rotation: (
    <>
      <DropdownMenuItem disabled description={NOT_PORTED}>
        <Icon icon={EditIcon} />
        Edit
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive" disabled description={NOT_PORTED}>
        <Icon name="trash" />
        Delete
      </DropdownMenuItem>
    </>
  ),
  honey: (
    <>
      <DropdownMenuItem disabled description={NOT_PORTED}>
        <Icon icon={EditIcon} />
        Edit
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive" disabled description={NOT_PORTED}>
        <Icon name="alert" />
        Revoke
      </DropdownMenuItem>
    </>
  )
};

const EnvironmentTable = ({
  ctx,
  slugs,
  render,
  actions
}: {
  ctx: RowContext;
  slugs: string[];
  render: (slug: string) => ReactNode;
  actions: (slug: string) => ReactNode;
}) => (
  <TableRow className={styles.nestedRow}>
    <TableCell colSpan={ctx.environments.length + 3} className={styles.nestedCell}>
      <Table className={styles.nestedTable}>
        <TableHeader>
          <TableRow>
            <TableHead className={styles.iconCell} />
            <TableHead className={styles.envName}>Environment</TableHead>
            <TableHead />
            <TableActionsHead slots={ROW_ACTION_SLOTS} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {ctx.environments
            .filter((environment) => slugs.includes(environment.value))
            .map((environment) => (
              <TableRow key={environment.value} className={styles.row}>
                <TableCell className={styles.iconCell} />
                <TableCell className={styles.envName}>{environment.label}</TableCell>
                <TableCell className={styles.nameCell}>{render(environment.value)}</TableCell>
                <TableActionsCell slots={ROW_ACTION_SLOTS}>
                  {actions(environment.value)}
                </TableActionsCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </TableCell>
  </TableRow>
);

export const KindRow = ({ row, ctx }: { row: KindRowType; ctx: RowContext }) => {
  const [expanded, setExpanded] = useState(false);
  const envOf = environmentOf[row.kind] as (entry: KindEntry) => string;
  const entries = row.entries as KindEntry[];
  const entryIn = (slug: string) => entries.find((entry) => envOf(entry) === slug)!;
  const actions = (slug: string) => (
    <RowActions
      label={ctx.single ? row.name : `${row.name} in ${environmentLabel(ctx, slug)}`}
      inline={inlineActions[row.kind]}
      menu={kindMenu[row.kind]}
    />
  );
  const present = (slug: string) => entries.some((entry) => envOf(entry) === slug);
  if (ctx.single) {
    const first = entries[0];
    return (
      <TableRow className={styles.row}>
        <SelectCell
          kind={row.kind}
          rowKey={row.key}
          label={row.name}
          ctx={ctx}
          selectable={false}
        />
        <TableCell colSpan={2} className={styles.nameCell}>
          <div className={styles.nameLine}>
            <span className={styles.truncate}>{row.name}</span>
            {details(row, first)}
          </div>
        </TableCell>
        <TableActionsCell slots={ROW_ACTION_SLOTS}>{actions(envOf(first))}</TableActionsCell>
      </TableRow>
    );
  }
  return (
    <>
      <TableRow
        className={styles.row}
        data-expanded={expanded || undefined}
        onClick={() => setExpanded(!expanded)}
      >
        <SelectCell
          kind={row.kind}
          rowKey={row.key}
          label={row.name}
          ctx={ctx}
          selectable={false}
          pinned={expanded}
          alternate={
            <ExpandToggle
              expanded={expanded}
              label={row.name}
              onToggle={() => setExpanded(!expanded)}
            />
          }
        />
        <TableCell className={styles.nameCell}>
          <div className={styles.nameLine}>
            <span className={styles.truncate}>{row.name}</span>
            {!expanded && <span className={styles.push}>{flag(row)}</span>}
          </div>
        </TableCell>
        {ctx.environments.map((environment) =>
          expanded ? (
            <TableCell key={environment.value} />
          ) : (
            <StatusCell
              key={environment.value}
              status={present(environment.value) ? "present" : "missing"}
            />
          )
        )}
        <TableActionsCell slots={ROW_ACTION_SLOTS} />
      </TableRow>
      {expanded && (
        <EnvironmentTable
          ctx={ctx}
          slugs={entries.map(envOf)}
          render={(slug) => <div className={styles.nameLine}>{details(row, entryIn(slug))}</div>}
          actions={actions}
        />
      )}
    </>
  );
};

export const FolderRow = ({
  row,
  ctx,
  onOpen,
  onEdit,
  onDelete
}: {
  row: Extract<Row, { kind: "folder" }>;
  ctx: RowContext;
  onOpen: () => void;
  onEdit: (entries: FolderEntry[]) => void;
  onDelete: (entries: FolderEntry[]) => void;
}) => {
  const first = row.entries[0];
  const present = (slug: string) => row.entries.some((entry) => entry.environment === slug);
  return (
    <TableRow className={`${styles.row} ${styles.clickable}`} onClick={onOpen}>
      <SelectCell kind="folder" rowKey={row.key} label={row.name} ctx={ctx} selectable />
      <TableCell colSpan={ctx.single ? 2 : undefined} className={styles.nameCell}>
        <div className={styles.nameLine}>
          <span className={styles.truncate} title={row.name}>
            {row.name}
          </span>
          {first.description && <InfoHint text={first.description} />}
        </div>
      </TableCell>
      {!ctx.single &&
        ctx.environments.map((environment) => (
          <StatusCell
            key={environment.value}
            status={present(environment.value) ? "present" : "missing"}
          />
        ))}
      <TableActionsCell slots={ROW_ACTION_SLOTS}>
        <RowActions
          label={row.name}
          inline={[
            later("Move folder", FolderInputIcon),
            {
              label: "Edit folder",
              icon: EditIcon,
              disabledReason: ctx.writeBlock,
              onSelect: () => onEdit(row.entries)
            },
            later("Manage access", UsersIcon)
          ]}
          menu={
            <DropdownMenuItem
              variant="destructive"
              disabled={Boolean(ctx.writeBlock)}
              description={ctx.writeBlock}
              onSelect={() => onDelete(row.entries)}
            >
              <Icon name="trash" />
              Delete folder
            </DropdownMenuItem>
          }
        />
      </TableActionsCell>
    </TableRow>
  );
};

export const ImportRow = ({
  row,
  ctx,
  projectName
}: {
  row: Extract<Row, { kind: "import" }>;
  ctx: RowContext;
  projectName: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const first: ImportEntry = row.entries[0];
  const present = (slug: string) => row.entries.some((entry) => entry.environment === slug);
  const label = (
    <span className={styles.importLabel}>
      {first.sourceProjectName && first.sourceProjectName !== projectName && (
        <Badge tone="warn">{first.sourceProjectName}</Badge>
      )}
      <Badge tone="outline">
        <Icon icon={LayersIcon} />
        {first.importEnv.name}
      </Badge>
      <Icon name="folder" size={14} />
      <span className={styles.truncate}>{first.importPath}</span>
    </span>
  );
  const replication = first.isReplication && first.lastReplicated && (
    <Tooltip
      content={`Last replication ${new Date(first.lastReplicated).toLocaleString("en-US")}${first.isReplicationSuccess === false ? `. Fail reason: ${first.replicationStatus ?? "unknown"}` : ""}`}
    >
      <span
        className={styles.hint}
        data-tone={first.isReplicationSuccess === false ? "bad" : undefined}
      >
        <Icon
          icon={first.isReplicationSuccess === false ? TriangleAlertIcon : undefined}
          name={first.isReplicationSuccess === false ? undefined : "info"}
          label="Replication status"
        />
      </span>
    </Tooltip>
  );
  return (
    <>
      <TableRow
        className={`${styles.row} ${ctx.single ? "" : styles.clickable}`}
        data-expanded={expanded || undefined}
        onClick={() => !ctx.single && setExpanded(!expanded)}
      >
        <SelectCell
          kind="import"
          rowKey={row.key}
          label={row.name}
          ctx={ctx}
          selectable={false}
          pinned={expanded}
          alternate={
            ctx.single ? undefined : (
              <ExpandToggle
                expanded={expanded}
                label={`secret import ${first.importPath}`}
                onToggle={() => setExpanded(!expanded)}
              />
            )
          }
        />
        <TableCell colSpan={ctx.single ? 2 : undefined} className={styles.nameCell}>
          <div className={styles.nameLine}>
            {label}
            {first.isAccessRevoked && (
              <span className={styles.push}>
                <Badge tone="bad">
                  <Icon icon={XIcon} />
                  Secret share revoked
                </Badge>
              </span>
            )}
            {ctx.single && <TableRowIndicators>{replication}</TableRowIndicators>}
          </div>
        </TableCell>
        {!ctx.single &&
          ctx.environments.map((environment) =>
            expanded ? (
              <TableCell key={environment.value} />
            ) : (
              <StatusCell
                key={environment.value}
                status={present(environment.value) ? "present" : "missing"}
              />
            )
          )}
        <TableActionsCell slots={ROW_ACTION_SLOTS}>
          {ctx.single && (
            <RowActions
              label={`secret import ${first.importPath}`}
              inline={[later("Resync", "sync"), later("Delete", "trash")]}
            />
          )}
        </TableActionsCell>
      </TableRow>
      {!ctx.single && expanded && (
        <TableRow className={styles.nestedRow}>
          <TableCell colSpan={ctx.environments.length + 3} className={styles.nestedCell}>
            <div className={styles.importedIn}>
              <span className={styles.subtle}>Imported in:</span>
              {row.entries.map((entry) => (
                <Badge key={entry.id} tone="outline">
                  <Icon icon={LayersIcon} />
                  {environmentLabel(ctx, entry.environment ?? "")}
                </Badge>
              ))}
              <span className={styles.push}>
                <span className={styles.hint} data-tone="info">
                  <Icon name="info" size={12} />
                </span>
                <span className={styles.subtle}>Select a single environment to manage imports</span>
              </span>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};
