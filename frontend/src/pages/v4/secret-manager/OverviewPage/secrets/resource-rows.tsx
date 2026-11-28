import { memo, type ReactNode } from "react";
import { Badge, type BadgeTone } from "@infisical/cipher/ui/badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { Icon } from "@infisical/cipher/ui/icon";
import { RowLink } from "@infisical/cipher/ui/row-link";
import {
  type RowActionList,
  RowActions,
  RowContextMenu,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowIndicators
} from "@infisical/cipher/ui/table";
import { StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import {
  ActivityIcon,
  ArrowDownUpIcon,
  BanIcon,
  ClockIcon,
  FileKeyIcon,
  FolderInputIcon,
  HandshakeIcon,
  ListIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  UsersIcon,
  XIcon
} from "lucide-react";

import {
  ProjectPermissionActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionProxiedServiceActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { providerMedia } from "@app/pages/v4/components/provider-label";

import type { ScopeState } from "../../../data/secrets/contract";
import { v4Path } from "../../../links";
import { nameLabel } from "../../../shell/resource-name";
import { withoutDefaults } from "../../search-defaults";
import {
  environments,
  type Resource,
  type ResourceKind,
  type Secret,
  selectionKey
} from "../secrets-model";
import { childPath } from "./flows/shared";
import {
  ChildSelectCell,
  ChildSelectHead,
  ExpandCell,
  KindIcon,
  RowStateBadges,
  PendingMenuItems,
  presenceOf,
  ROW_ACTION_SLOTS,
  type RowActionProps,
  type RowContext,
  SelectCell,
  selectableKinds,
  StatusCell,
  stopRowClick,
  sameRow
} from "./overview-cells";
import type { PermissionScope } from "./row-actions/permissions";
import { canReconcile } from "./row-actions/rotation-actions";
import { SecretValue } from "./secret-row";

import styles from "./overview.module.css";

type Of<K extends ResourceKind> = Extract<Resource, { kind: K }>;

const OVERVIEW_ROUTE = v4Path(
  "/organizations/$orgId/projects/secret-management/$projectId/overview"
);

const gate = (
  ctx: RowContext,
  sub: ProjectPermissionSub,
  action: string,
  scope: PermissionScope,
  verb: string
) => ctx.writeBlock ?? ctx.blockFor?.(sub, action, scope, verb);

const gateAny = (
  ctx: RowContext,
  sub: ProjectPermissionSub,
  action: string,
  scopes: PermissionScope[],
  verb: string
) => {
  const blocks = scopes.map((scope) => gate(ctx, sub, action, scope, verb));
  return blocks.every(Boolean) ? blocks[0] : undefined;
};
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
        <Icon name="info" size="var(--cipher-size-icon-caption)" label={text} />
      </span>
    </Tooltip>
  );
}

function RotationStatus({ rotation }: { rotation: Of<"rotation"> }) {
  if (rotation.status === "failed")
    return (
      <Badge reason={`Failure reason: ${rotation.statusDetails ?? "unknown"}`} tone="bad">
        <Icon icon={XIcon} />
        Rotation failed
      </Badge>
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

type SpecActions = { inline: RowActionList; menu?: ReactNode; menuDisabledReason?: string };
type Spec = {
  label: (entry: Resource) => ReactNode;
  details: (entry: Resource) => ReactNode;
  flag?: (entries: Resource[]) => ReactNode;
  actions: (entry: Resource, ctx: RowContext) => SpecActions;
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
            <Badge
              reason={item.statusDetails ?? "The provider returned an error while revoking leases."}
              tone={item.status === "deleting" ? "warn" : "bad"}
            >
              <Icon icon={TriangleAlertIcon} />
              {item.status === "deleting" ? "Revoking" : "Deletion failed"}
            </Badge>
          )}
        </>
      );
    },
    flag: (entries) =>
      entries.some((entry) => entry.kind === "dynamic" && entry.status) && (
        <Badge reason="One or more dynamic secrets have issues." tone="bad">
          <Icon icon={XIcon} />
          Deletion failed
        </Badge>
      ),
    actions: (entry, ctx) => {
      const item = entry as Of<"dynamic">;
      const run = (action: "leases" | "edit" | "delete" | "force-delete") => () =>
        ctx.onAction({ kind: "dynamic", action, entry: item });
      const scope = { environment: item.environment, secretPath: item.path };
      const dynamicGate = (action: ProjectPermissionDynamicSecretActions, verb: string) =>
        gate(ctx, ProjectPermissionSub.DynamicSecrets, action, scope, verb) ??
        (item.status === "deleting" ? "Dynamic secret is being revoked" : undefined);
      const leaseBlock = dynamicGate(
        ProjectPermissionDynamicSecretActions.Lease,
        "lease this dynamic secret"
      );
      const editBlock = dynamicGate(
        ProjectPermissionDynamicSecretActions.EditRootCredential,
        "edit this dynamic secret"
      );
      const block = dynamicGate(
        ProjectPermissionDynamicSecretActions.DeleteRootCredential,
        "delete this dynamic secret"
      );
      const forceBlock =
        gate(
          ctx,
          ProjectPermissionSub.DynamicSecrets,
          ProjectPermissionDynamicSecretActions.DeleteRootCredential,
          scope,
          "delete this dynamic secret"
        ) ??
        (item.status === "failed-deletion"
          ? undefined
          : "Only a dynamic secret whose deletion failed can be force deleted");
      return {
        inline: [
          {
            label: "Leases",
            icon: FileKeyIcon,
            disabledReason: leaseBlock,
            onSelect: run("leases")
          }
        ],
        menu: (
          <>
            <DropdownMenuItem
              disabled={Boolean(editBlock)}
              description={editBlock}
              onSelect={run("edit")}
            >
              <Icon name="pencil" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={Boolean(forceBlock)}
              description={forceBlock}
              onSelect={run("force-delete")}
            >
              <Icon icon={XIcon} />
              Force delete
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={Boolean(block)}
              description={block}
              onSelect={run("delete")}
            >
              <Icon name="trash" />
              Delete
            </DropdownMenuItem>
          </>
        )
      };
    }
  },
  rotation: {
    label: (entry) => entry.name,
    details: (entry) => {
      const item = entry as Of<"rotation">;
      return (
        <>
          <Badge
            tone="outline"
            media={item.type && providerMedia("secret-rotation", item.type as SecretRotation)}
          >
            {item.provider}
          </Badge>
          {item.description && <InfoHint text={item.description} />}
          <span className={styles.push}>
            <RotationStatus rotation={item} />
          </span>
        </>
      );
    },
    flag: (entries) =>
      entries.some((entry) => entry.kind === "rotation" && entry.status === "failed") && (
        <Badge reason="One or more secrets failed to rotate." tone="bad">
          <Icon icon={XIcon} />
          Rotation failed
        </Badge>
      ),
    actions: (entry, ctx) => {
      const item = entry as Of<"rotation">;
      const run =
        (action: "validate" | "credentials" | "rotate" | "reconcile" | "edit" | "delete") => () =>
          ctx.onAction({ kind: "rotation", action, entry: item });
      const rotationGate = (action: ProjectPermissionSecretRotationActions, verb: string) =>
        gate(
          ctx,
          ProjectPermissionSub.SecretRotation,
          action,
          {
            environment: item.environment,
            secretPath: item.path,
            ...(item.connectionId ? { connectionId: item.connectionId } : {})
          },
          verb
        );
      const rotateBlock = rotationGate(
        ProjectPermissionSecretRotationActions.RotateSecrets,
        "rotate this rotation's secrets"
      );
      const validateBlock = rotationGate(
        ProjectPermissionSecretRotationActions.Read,
        "validate this rotation's credentials"
      );
      const credentialsBlock = rotationGate(
        ProjectPermissionSecretRotationActions.ReadGeneratedCredentials,
        "view this rotation's generated credentials"
      );
      const editBlock = rotationGate(
        ProjectPermissionSecretRotationActions.Edit,
        "edit this rotation"
      );
      const block = rotationGate(
        ProjectPermissionSecretRotationActions.Delete,
        "delete this rotation"
      );
      const reconcileBlock =
        rotationGate(ProjectPermissionSecretRotationActions.Edit, "reconcile this rotation") ??
        (canReconcile(item)
          ? undefined
          : "Only local account rotations that log in as the target can be reconciled");
      return {
        inline: [
          {
            label: "Rotate secret",
            icon: "sync",
            disabledReason: rotateBlock,
            onSelect: run("rotate")
          }
        ],
        menu: (
          <>
            <DropdownMenuItem
              disabled={Boolean(validateBlock)}
              description={validateBlock}
              onSelect={run("validate")}
            >
              <Icon icon={ActivityIcon} />
              Validate credentials
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={Boolean(credentialsBlock)}
              description={credentialsBlock}
              onSelect={run("credentials")}
            >
              <Icon name="eye" />
              View generated credentials
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={Boolean(reconcileBlock)}
              description={reconcileBlock}
              onSelect={run("reconcile")}
            >
              <Icon icon={HandshakeIcon} />
              Reconcile secret
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={Boolean(editBlock)}
              description={editBlock}
              onSelect={run("edit")}
            >
              <Icon name="pencil" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={Boolean(block)}
              description={block}
              onSelect={run("delete")}
            >
              <Icon name="trash" />
              Delete
            </DropdownMenuItem>
          </>
        )
      };
    }
  },
  honey: {
    label: (entry) => entry.name,
    details: (entry) => {
      const item = entry as Of<"honey">;
      return (
        <>
          <Badge tone="outline" media={item.type && providerMedia("honey-token", item.type)}>
            {item.provider} honey token
          </Badge>
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
      const honeyGate = (action: ProjectPermissionHoneyTokenActions, verb: string) =>
        item.status === "revoked"
          ? "Revoked honey tokens cannot be edited"
          : gate(
              ctx,
              ProjectPermissionSub.HoneyTokens,
              action,
              { environment: item.environment, secretPath: item.path },
              verb
            );
      const block = honeyGate(ProjectPermissionHoneyTokenActions.Edit, "edit this honey token");
      const revokeBlock = honeyGate(
        ProjectPermissionHoneyTokenActions.Revoke,
        "revoke this honey token"
      );
      return {
        inline: [],
        menu: (
          <>
            <DropdownMenuItem onSelect={run("details")}>
              <Icon icon={ListIcon} />
              View details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={Boolean(block)} description={block} onSelect={run("edit")}>
              <Icon name="pencil" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={Boolean(revokeBlock)}
              description={revokeBlock}
              variant="destructive"
              onSelect={run("revoke")}
            >
              <Icon name="alert" />
              Revoke
            </DropdownMenuItem>
          </>
        )
      };
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
      const run = (action: "edit" | "delete") => () =>
        ctx.onAction({ kind: "proxy", action, entry: item });
      const proxyGate = (action: ProjectPermissionProxiedServiceActions, verb: string) =>
        gate(
          ctx,
          ProjectPermissionSub.ProxiedServices,
          action,
          { environment: item.environment, secretPath: item.path },
          verb
        );
      const editBlock = proxyGate(
        ProjectPermissionProxiedServiceActions.Edit,
        "edit this proxied service"
      );
      const deleteBlock = proxyGate(
        ProjectPermissionProxiedServiceActions.Delete,
        "delete this proxied service"
      );
      return {
        inline: [],
        menu: (
          <>
            <DropdownMenuItem
              disabled={Boolean(editBlock)}
              description={editBlock}
              onSelect={run("edit")}
            >
              <Icon name="pencil" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={Boolean(deleteBlock)}
              description={deleteBlock}
              onSelect={run("delete")}
            >
              <Icon name="trash" />
              Delete
            </DropdownMenuItem>
          </>
        )
      };
    }
  }
};

function EnvironmentTable({
  ctx,
  label,
  entries,
  render,
  actions,
  valueHeader
}: {
  ctx: RowContext;
  label: string;
  entries: Resource[];
  render: (entry: Resource) => ReactNode;
  actions: (entry: Resource) => RowActionProps;
  valueHeader?: ReactNode;
}) {
  return (
    <TableRow className={styles.nestedRow}>
      <TableCell pin="viewport" colSpan={ctx.environments.length + 3} className={styles.nestedCell}>
        <Table className={styles.nestedTable}>
          <TableHeader>
            <TableRow>
              <ChildSelectHead resources={entries} label={label} ctx={ctx} />
              <TableHead className={styles.envName}>Environment</TableHead>
              <TableHead>{valueHeader}</TableHead>
              <TableActionsHead slots={ROW_ACTION_SLOTS} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {ctx.environments
              .filter((environment) =>
                entries.some((entry) => entry.environment === environment.value)
              )
              .map((environment) => {
                const entry = entries.find((item) => item.environment === environment.value)!;
                const rowActions = actions(entry);
                return (
                  <RowContextMenu key={environment.value} {...rowActions}>
                    <TableRow className={styles.row}>
                      <ChildSelectCell
                        resource={entry}
                        label={`${label} in ${environment.label}`}
                        ctx={ctx}
                      />
                      <TableCell className={styles.envName}>{environment.label}</TableCell>
                      <TableCell className={styles.nameCell}>{render(entry)}</TableCell>
                      <TableActionsCell slots={ROW_ACTION_SLOTS}>
                        <RowActions lazy {...rowActions} />
                      </TableActionsCell>
                    </TableRow>
                  </RowContextMenu>
                );
              })}
          </TableBody>
        </Table>
      </TableCell>
    </TableRow>
  );
}

function KindRowView({
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
  const expanded = ctx.expanded.includes(rowKey);
  const setExpanded = (open: boolean) => ctx.onExpand(rowKey, open);
  const spec = specs[kind];
  const first = entries[0];
  const line = (entry: Resource, withName: boolean) => (
    <div className={styles.nameLine}>
      {withName && <span className={styles.truncate}>{spec.label(entry)}</span>}
      <span className={styles.nameDetails}>
        {withName && <RowStateBadges rowKey={rowKey} ctx={ctx} />}
        {spec.details(entry)}
      </span>
    </div>
  );
  const actions = (entry: Resource): RowActionProps => ({
    label: ctx.single
      ? entry.name
      : `${entry.name} in ${environments.find((environment) => environment.value === entry.environment)?.label ?? entry.environment}`,
    ...spec.actions(entry, ctx)
  });
  if (ctx.single) {
    const rowActions = actions(first);
    return (
      <RowContextMenu {...rowActions}>
        <TableRow data-recent={ctx.recent.includes(rowKey) || undefined} className={styles.row}>
          <SelectCell
            kind={kind}
            keys={[selectionKey(first)]}
            label={first.name}
            ctx={ctx}
            selectable={selectableKinds.includes(kind)}
          />
          <TableCell
            pin="start"
            pinOffset="var(--cipher-size-row)"
            colSpan={2}
            className={styles.nameCell}
          >
            {line(first, true)}
          </TableCell>
          <TableActionsCell slots={ROW_ACTION_SLOTS}>
            <RowActions lazy {...rowActions} />
          </TableActionsCell>
        </TableRow>
      </RowContextMenu>
    );
  }
  return (
    <>
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
          label={first.name}
          onToggle={() => setExpanded(!expanded)}
          kind={kind}
        />
        <TableCell pin="start" pinOffset="var(--cipher-size-row)" className={styles.nameCell}>
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
        <TableActionsCell slots={ROW_ACTION_SLOTS} />
      </TableRow>
      {expanded && (
        <EnvironmentTable
          ctx={ctx}
          label={first.name}
          entries={entries}
          render={(entry) => line(entry, false)}
          actions={actions}
        />
      )}
    </>
  );
}

function FolderRowView({
  rowKey,
  entries,
  ctx,
  secretPath,
  onEdit,
  onDelete
}: {
  rowKey: string;
  entries: Of<"folder">[];
  ctx: RowContext;
  secretPath: string;
  onEdit: (folder: Of<"folder">) => void;
  onDelete: (folder: Of<"folder">) => void;
}) {
  const first = entries[0];
  const folderScopes = entries.map((entry) => ({
    environment: entry.environment,
    secretPath: `${entry.path.replace(/\/$/, "")}/${entry.name}`
  }));
  const folderGate = (action: string, verb: string) =>
    gateAny(ctx, ProjectPermissionSub.SecretFolders, action, folderScopes, verb);
  const editBlock = folderGate(ProjectPermissionActions.Edit, "edit this folder");
  const deleteBlock = folderGate(ProjectPermissionActions.Delete, "delete this folder");
  const accessBlock = folderGate(
    ProjectPermissionSecretFolderActions.ManageAccess,
    "manage access to this folder"
  );
  const byEnvironment = ctx.environments.flatMap(
    (environment) => entries.find((entry) => entry.environment === environment.value) ?? []
  );
  const accessEntry =
    byEnvironment.find(
      (entry) =>
        !gate(
          ctx,
          ProjectPermissionSub.SecretFolders,
          ProjectPermissionSecretFolderActions.ManageAccess,
          { environment: entry.environment, secretPath: childPath(entry.path, entry.name) },
          "manage access to this folder"
        )
    ) ??
    byEnvironment[0] ??
    first;
  const rowActions: RowActionProps = {
    label: first.name,
    inline: [
      {
        label: "Manage access",
        icon: UsersIcon,
        disabledReason: accessBlock,
        onSelect: () =>
          ctx.onAction({
            kind: "folder",
            action: "access",
            environment: accessEntry.environment,
            secretPath: childPath(accessEntry.path, accessEntry.name)
          })
      }
    ],
    menu: (
      <>
        <PendingMenuItems id={first.id} ctx={ctx} />
        <DropdownMenuItem
          disabled={Boolean(editBlock)}
          description={editBlock}
          onSelect={() => ctx.onAction({ kind: "folder", action: "move", entry: first, entries })}
        >
          <Icon icon={FolderInputIcon} />
          Move folder
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={Boolean(editBlock)}
          description={editBlock}
          onSelect={() => onEdit(first)}
        >
          <Icon name="pencil" />
          Edit folder
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={Boolean(deleteBlock)}
          description={deleteBlock}
          onSelect={() => onDelete(first)}
        >
          <Icon name="trash" />
          Delete folder
        </DropdownMenuItem>
      </>
    )
  };
  return (
    <RowContextMenu {...rowActions}>
      <TableRow
        data-recent={ctx.recent.includes(rowKey) || undefined}
        data-pending={ctx.pending?.[first.id]}
        className={styles.row}
      >
        <SelectCell
          kind="folder"
          keys={entries.map(selectionKey)}
          label={first.name}
          ctx={ctx}
          selectable
        />
        <TableCell
          pin="start"
          pinOffset="var(--cipher-size-row)"
          colSpan={ctx.single ? 2 : undefined}
          className={styles.nameCell}
        >
          <div className={styles.nameLine}>
            <RowLink
              link={{
                from: OVERVIEW_ROUTE,
                to: ".",
                search: (previous) =>
                  withoutDefaults(
                    { ...previous, secretPath, search: "" },
                    { secretPath: "/", search: "", environments: [] }
                  )
              }}
              title={first.name}
            >
              {first.name}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--cipher-space-8)",
                  marginInlineStart: "var(--cipher-space-8)",
                  verticalAlign: "middle"
                }}
              >
                {first.description && <InfoHint text={first.description} />}
                <RowStateBadges rowKey={rowKey} resource={first} ctx={ctx} />
              </span>
            </RowLink>
          </div>
        </TableCell>
        {!ctx.single &&
          ctx.environments.map((environment) => (
            <StatusCell key={environment.value} status={presenceOf(entries, environment.value)} />
          ))}
        <TableActionsCell slots={ROW_ACTION_SLOTS} onClick={stopRowClick}>
          <RowActions lazy {...rowActions} />
        </TableActionsCell>
      </TableRow>
    </RowContextMenu>
  );
}

const environmentLabel = (slug: string) =>
  environments.find((option) => option.value === slug)?.label ?? slug;

const sourceLabelOf = (entry: Of<"import">) =>
  `${environmentLabel(entry.source.environment)} ${entry.source.path}`;

const secretCount = (count: number) => `${count} ${count === 1 ? "secret" : "secrets"}`;

const replicationOf = (entry: Of<"import">, count?: number, single = false) => {
  const from = count === undefined ? "" : ` ${secretCount(count)} from ${sourceLabelOf(entry)}.`;
  if (entry.replicationStatus === "pending" || !entry.lastReplicated)
    return {
      tone: "neutral" as const,
      icon: ClockIcon,
      label: "Pending",
      reason: "Waiting for the first replication."
    };
  const when = formatDistanceToNow(new Date(entry.lastReplicated), { addSuffix: true });
  if (entry.replicationStatus === "failed")
    return {
      tone: "bad" as const,
      icon: TriangleAlertIcon,
      label: "Failed",
      reason: `Replication failed ${when}. ${entry.replicationDetails ?? "No reason was recorded."} ${single ? "Resync to try again." : `Resync from the ${environmentLabel(entry.environment)} view.`}`
    };
  return {
    tone: "ok" as const,
    icon: RefreshCwIcon,
    label: "Synced",
    reason: `Replicated ${when}.${from}`
  };
};

export type ImportSource = {
  secrets: (entry: Of<"import">) => Secret[];
  state: (entry: Of<"import">) => ScopeState;
  missing: (entry: Of<"import">) => boolean;
  ownKeys: (entry: Of<"import">) => Set<string>;
};

function ImportEnvCell({ entry, source }: { entry?: Of<"import">; source: ImportSource }) {
  if (!entry) return <StatusCell status="missing" />;
  const status = (() => {
    if (entry.revoked)
      return {
        tone: "neutral" as const,
        icon: BanIcon,
        label: "Revoked",
        reason: `${entry.sourceProjectName ?? "The source project"} revoked access to these secrets.`
      };
    if (source.missing(entry))
      return {
        tone: "warn" as const,
        icon: TriangleAlertIcon,
        label: "Source missing",
        reason: `${sourceLabelOf(entry)} no longer exists, so this import adds no secrets.`
      };
    const state = source.state(entry);
    const count = state === "loaded" ? source.secrets(entry).length : undefined;
    if (entry.replicated) return replicationOf(entry, count);
    if (state === "failed")
      return {
        tone: "bad" as const,
        icon: TriangleAlertIcon,
        label: "Unavailable",
        reason: "Couldn't load the secrets in this folder."
      };
    return {
      count,
      reason:
        count === undefined ? undefined : `${secretCount(count)} from ${sourceLabelOf(entry)}.`
    };
  })();
  return (
    <TableCell className={styles.importCell}>
      {"label" in status ? (
        <StatusText size="sm" tone={status.tone} icon={status.icon} reason={status.reason}>
          {status.label}
        </StatusText>
      ) : (
        <StatusText size="sm" loading={status.count === undefined} reason={status.reason}>
          {status.count ?? ""}
        </StatusText>
      )}
    </TableCell>
  );
}

function ImportedKeyCell({
  entry,
  name,
  source
}: {
  entry?: Of<"import">;
  name: string;
  source: ImportSource;
}) {
  const imported =
    entry && !entry.revoked && source.secrets(entry).some((secret) => secret.name === name);
  if (!imported) return <StatusCell status="missing" />;
  if (!source.ownKeys(entry).has(name))
    return <StatusCell status="present" label="Imported into environment" />;
  return (
    <TableCell className={styles.importCell}>
      <StatusText
        size="sm"
        reason={`${environmentLabel(entry.environment)} sets its own ${name}, so this value is not used there.`}
      >
        Overridden
      </StatusText>
    </TableCell>
  );
}

const EMPTY_IMPORT_MESSAGES: Record<ScopeState, string> = {
  loading: "Loading secrets…",
  failed: "Couldn't load the secrets in this folder.",
  loaded: "No secrets in this folder."
};

export function ImportRow({
  rowKey,
  entries,
  ctx,
  source,
  projectId,
  revealAll
}: {
  rowKey: string;
  entries: Of<"import">[];
  ctx: RowContext;
  source: ImportSource;
  projectId: string;
  revealAll: boolean;
}) {
  const expanded = ctx.expanded.includes(rowKey);
  const setExpanded = (open: boolean) => ctx.onExpand(rowKey, open);
  const first = entries[0];
  const crossProject = first.source.project !== projectId;
  const sourceProject = nameLabel(
    { id: first.source.project, name: first.sourceProjectName, pending: false },
    "project"
  );
  const sourceEnvironment =
    environments.find((environment) => environment.value === first.source.environment)?.label ??
    first.source.environment;
  const label = (
    <>
      <span className={`${styles.importLabel} ${styles.importWide}`}>
        {crossProject && <Badge tone="warn">{sourceProject}</Badge>}
        <Badge tone="outline">
          <Icon name="layers" />
          {sourceEnvironment}
        </Badge>
        <Icon name="folder" size="var(--cipher-size-icon-small)" />
        <span className={styles.truncate}>{first.source.path}</span>
      </span>
      <span className={`${styles.importLabel} ${styles.importNarrow}`}>
        <span className={styles.truncate}>{first.source.path}</span>
        <span className={styles.nameDetails}>
          <span className={styles.subtle}>
            {crossProject && <>{sourceProject} </>}
            {sourceEnvironment}
          </span>
        </span>
      </span>
    </>
  );
  const replication = (entry: Of<"import">) => {
    if (!entry.replicated) return null;
    const status = replicationOf(entry, undefined, true);
    return (
      <Tooltip content={status.reason}>
        <span className={styles.hint} data-tone={status.tone === "bad" ? "bad" : undefined}>
          <Icon icon={status.icon} label={`Replication ${status.label.toLowerCase()}`} />
        </span>
      </Tooltip>
    );
  };
  const importGate = (entry: Of<"import">, action: ProjectPermissionActions, verb: string) =>
    gate(
      ctx,
      ProjectPermissionSub.SecretImports,
      action,
      { environment: entry.environment, secretPath: entry.path },
      verb
    );
  const resyncBlock = (entry: Of<"import">) =>
    importGate(entry, ProjectPermissionActions.Edit, "resync this secret import") ??
    (entry.replicated ? undefined : "Only replicated imports resync");
  const deleteBlock = (entry: Of<"import">) =>
    importGate(entry, ProjectPermissionActions.Delete, "remove this secret import");
  const reorderBlock = importGate(first, ProjectPermissionActions.Edit, "reorder secret imports");
  const rowActions: RowActionProps = {
    label: `secret import ${first.source.path}`,
    menu: ctx.single ? (
      <>
        <DropdownMenuItem
          disabled={Boolean(reorderBlock)}
          description={reorderBlock}
          onSelect={() => ctx.onAction({ kind: "import", action: "reorder", entry: first })}
        >
          <Icon icon={ArrowDownUpIcon} />
          Reorder imports
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={Boolean(resyncBlock(first))}
          description={resyncBlock(first)}
          onSelect={() => ctx.onAction({ kind: "import", action: "resync", entry: first })}
        >
          <Icon name="sync" />
          Resync
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={Boolean(deleteBlock(first))}
          description={deleteBlock(first)}
          onSelect={() => ctx.onAction({ kind: "import", action: "delete", entry: first })}
        >
          <Icon name="trash" />
          Delete
        </DropdownMenuItem>
      </>
    ) : undefined
  };
  const keys = expanded && !first.revoked ? source.secrets(first) : [];
  const emptyMessage = keys.length === 0 ? EMPTY_IMPORT_MESSAGES[source.state(first)] : undefined;
  const entryAt = (environment: string) =>
    entries.find((entry) => entry.environment === environment);
  const readable = entries.filter((entry) => !entry.revoked);
  const importedKeys =
    !ctx.single && expanded
      ? [
          ...new Set(
            readable.flatMap((entry) => source.secrets(entry).map((secret) => secret.name))
          )
        ]
      : [];
  const multiEmpty = readable.length
    ? EMPTY_IMPORT_MESSAGES[source.state(readable[0])]
    : "Access to this source was revoked, so its secrets are not shown.";
  return (
    <>
      <RowContextMenu {...rowActions}>
        <TableRow
          data-recent={ctx.recent.includes(rowKey) || undefined}
          className={styles.row}
          data-expanded={expanded || undefined}
          onClick={() => setExpanded(!expanded)}
        >
          <ExpandCell
            expanded={expanded}
            label={`secret import ${first.source.path}`}
            onToggle={() => setExpanded(!expanded)}
          />
          <TableCell
            pin="start"
            pinOffset="var(--cipher-size-row)"
            colSpan={ctx.single ? 2 : undefined}
            className={styles.nameCell}
          >
            <div className={`${styles.nameLine} ${styles.importLine}`}>
              <span className={styles.nameKind}>
                <KindIcon kind="import" />
              </span>
              {label}
              <RowStateBadges rowKey={rowKey} ctx={ctx} />
              {ctx.single && first.revoked && (
                <span className={styles.push}>
                  <Badge tone="bad">
                    <Icon icon={XIcon} />
                    Secret share revoked
                  </Badge>
                </span>
              )}
              {ctx.single && <TableRowIndicators>{replication(first)}</TableRowIndicators>}
            </div>
          </TableCell>
          {!ctx.single &&
            ctx.environments.map((environment) => (
              <ImportEnvCell
                key={environment.value}
                entry={entryAt(environment.value)}
                source={source}
              />
            ))}
          <TableActionsCell slots={ROW_ACTION_SLOTS} onClick={stopRowClick}>
            {ctx.single && <RowActions lazy {...rowActions} />}
          </TableActionsCell>
        </TableRow>
      </RowContextMenu>
      {ctx.single && expanded && !first.revoked && (
        <TableRow className={styles.nestedHead}>
          <TableCell pin="start" selection divider={false} />
          <TableCell pin="start" pinOffset="var(--cipher-size-row)" className={styles.nameCell}>
            <span>Name</span>
          </TableCell>
          <TableCell colSpan={2} className={styles.valueCell}>
            Value
          </TableCell>
        </TableRow>
      )}
      {ctx.single &&
        keys.map((secret) => (
          <TableRow key={secret.id} className={styles.importedRow}>
            <TableCell pin="start" selection divider={false} />
            <TableCell pin="start" pinOffset="var(--cipher-size-row)" className={styles.nameCell}>
              <span className={styles.truncate}>{secret.name}</span>
            </TableCell>
            <TableCell colSpan={2} className={styles.valueCell}>
              <SecretValue secret={secret} visible={revealAll} />
            </TableCell>
          </TableRow>
        ))}
      {ctx.single && expanded && !first.revoked && emptyMessage && (
        <TableRow className={styles.importedRow}>
          <TableCell pin="start" selection divider={false} />
          <TableCell colSpan={3} className={styles.subtle}>
            {emptyMessage}
          </TableCell>
        </TableRow>
      )}
      {ctx.single && expanded && first.revoked && (
        <TableRow className={styles.importedRow}>
          <TableCell pin="start" selection divider={false} />
          <TableCell colSpan={3} className={styles.subtle}>
            Access to this source was revoked, so its secrets are not shown.
          </TableCell>
        </TableRow>
      )}
      {!ctx.single &&
        importedKeys.map((name) => (
          <TableRow key={name} className={styles.importedRow}>
            <TableCell pin="start" selection divider={false} />
            <TableCell pin="start" pinOffset="var(--cipher-size-row)" className={styles.nameCell}>
              <span className={styles.truncate}>{name}</span>
            </TableCell>
            {ctx.environments.map((environment) => (
              <ImportedKeyCell
                key={environment.value}
                entry={entryAt(environment.value)}
                name={name}
                source={source}
              />
            ))}
            <TableActionsCell slots={ROW_ACTION_SLOTS} />
          </TableRow>
        ))}
      {!ctx.single && expanded && importedKeys.length === 0 && (
        <TableRow className={styles.importedRow}>
          <TableCell pin="start" selection divider={false} />
          <TableCell colSpan={ctx.environments.length + 2} className={styles.subtle}>
            {multiEmpty}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export const kindRowKinds = Object.keys(specs) as (keyof typeof specs)[];

export const KindRow = memo(KindRowView, sameRow);
export const FolderRow = memo(FolderRowView, sameRow);
