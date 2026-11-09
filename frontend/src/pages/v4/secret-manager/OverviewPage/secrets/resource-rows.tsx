import { memo, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@app/components/v4/ui/hover-card";
import { Icon } from "@app/components/v4/ui/icon";
import { RowLink } from "@app/components/v4/ui/row-link";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import {
  type RowActionList,
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
} from "@app/components/v4/ui/table";
import {
  ProjectPermissionActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionProxiedServiceActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { v4Path } from "../../../links";
import { withoutDefaults } from "../../search-defaults";
import {
  environments,
  readableValue,
  type Resource,
  type ResourceKind,
  type Secret,
  selectionKey
} from "../secrets-model";
import {
  ChildSelectCell,
  ChildSelectHead,
  ChromeRow,
  type EnvironmentOption,
  ExpandCell,
  KindIcon,
  LazyRowActions,
  PendingBadge,
  PendingMenuItems,
  presenceOf,
  ROW_ACTION_SLOTS,
  type RowActionProps,
  type RowContext,
  RowTooltip,
  SelectCell,
  selectableKinds,
  StatusCell,
  stopRowClick,
  sameRow
} from "./overview-cells";
import { type PermissionScope, useFolderAccessPlanBlock } from "./row-actions/permissions";
import { canReconcile } from "./row-actions/rotation-actions";

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
    <RowTooltip content={text}>
      <span className={styles.hint}>
        <Icon name="info" size={12} label={text} />
      </span>
    </RowTooltip>
  );
}

function RotationStatus({ rotation }: { rotation: Of<"rotation"> }) {
  if (rotation.status === "failed")
    return (
      <RowTooltip content={`Failure reason: ${rotation.statusDetails ?? "unknown"}`}>
        <Badge tone="bad">
          <Icon icon={XIcon} />
          Rotation failed
        </Badge>
      </RowTooltip>
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
            <RowTooltip
              content={
                item.statusDetails ?? "The provider returned an error while revoking leases."
              }
            >
              <Badge tone={item.status === "deleting" ? "warn" : "bad"}>
                <Icon icon={TriangleAlertIcon} />
                {item.status === "deleting" ? "Revoking" : "Deletion failed"}
              </Badge>
            </RowTooltip>
          )}
        </>
      );
    },
    flag: (entries) =>
      entries.some((entry) => entry.kind === "dynamic" && entry.status) && (
        <RowTooltip content="One or more dynamic secrets have issues.">
          <Badge tone="bad">
            <Icon icon={XIcon} />
            Deletion failed
          </Badge>
        </RowTooltip>
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
              <Icon icon={EditIcon} />
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
        <RowTooltip content="One or more secrets failed to rotate.">
          <Badge tone="bad">
            <Icon icon={XIcon} />
            Rotation failed
          </Badge>
        </RowTooltip>
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
              <Icon icon={EditIcon} />
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
              <Icon icon={EditIcon} />
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
              <RowTooltip content={new Date(item.lastUsedAt).toLocaleString("en-US")}>
                <span className={styles.subtle}>
                  Used {formatDistanceToNow(new Date(item.lastUsedAt), { addSuffix: true })}
                </span>
              </RowTooltip>
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
              <Icon icon={EditIcon} />
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
        <div>
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
                      <ChromeRow className={styles.row}>
                        <ChildSelectCell
                          resource={entry}
                          label={`${label} in ${environment.label}`}
                          ctx={ctx}
                        />
                        <TableCell className={styles.envName}>{environment.label}</TableCell>
                        <TableCell className={styles.nameCell}>{render(entry)}</TableCell>
                        <TableActionsCell slots={ROW_ACTION_SLOTS}>
                          <LazyRowActions {...rowActions} />
                        </TableActionsCell>
                      </ChromeRow>
                    </RowContextMenu>
                  );
                })}
            </TableBody>
          </Table>
        </div>
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
  const [expanded, setExpanded] = useState(false);
  const spec = specs[kind];
  const first = entries[0];
  const line = (entry: Resource, withName: boolean) => (
    <div className={styles.nameLine}>
      {withName && <span className={styles.truncate}>{spec.label(entry)}</span>}
      {spec.details(entry)}
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
        <ChromeRow
          data-state={ctx.recent.includes(rowKey) ? "selected" : undefined}
          className={styles.row}
        >
          <SelectCell
            kind={kind}
            keys={[selectionKey(first)]}
            label={first.name}
            ctx={ctx}
            selectable={selectableKinds.includes(kind)}
          />
          <TableCell
            pin="start"
            pinOffset="var(--v4-size-row)"
            colSpan={2}
            className={styles.nameCell}
          >
            {line(first, true)}
          </TableCell>
          <TableActionsCell slots={ROW_ACTION_SLOTS}>
            <LazyRowActions {...rowActions} />
          </TableActionsCell>
        </ChromeRow>
      </RowContextMenu>
    );
  }
  return (
    <>
      <TableRow
        data-state={ctx.recent.includes(rowKey) ? "selected" : undefined}
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
        />
        <TableCell pin="start" pinOffset="var(--v4-size-row)" className={styles.nameCell}>
          <div className={styles.nameLine}>
            <span className={styles.nameKind}>
              <KindIcon kind={kind} />
            </span>
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
  const planBlock = useFolderAccessPlanBlock();
  const folderScopes = entries.map((entry) => ({
    environment: entry.environment,
    secretPath: `${entry.path.replace(/\/$/, "")}/${entry.name}`
  }));
  const folderGate = (action: string, verb: string) =>
    gateAny(ctx, ProjectPermissionSub.SecretFolders, action, folderScopes, verb);
  const editBlock = folderGate(ProjectPermissionActions.Edit, "edit this folder");
  const deleteBlock = folderGate(ProjectPermissionActions.Delete, "delete this folder");
  const accessBlock = ctx.single
    ? (folderGate(
        ProjectPermissionSecretFolderActions.ManageAccess,
        "manage access to this folder"
      ) ?? planBlock)
    : "Select a single environment to manage folder access.";
  const rowActions: RowActionProps = {
    label: first.name,
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
        <DropdownMenuItem
          disabled={Boolean(accessBlock)}
          description={accessBlock}
          onSelect={() => ctx.onAction({ kind: "folder", action: "access", entry: first, entries })}
        >
          <Icon icon={UsersIcon} />
          Manage access
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={Boolean(editBlock)}
          description={editBlock}
          onSelect={() => onEdit(first)}
        >
          <Icon icon={EditIcon} />
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
      <ChromeRow
        data-state={ctx.recent.includes(rowKey) ? "selected" : undefined}
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
          pinOffset="var(--v4-size-row)"
          colSpan={ctx.single ? 2 : undefined}
          className={styles.nameCell}
        >
          <div className={styles.nameLine}>
            <RowLink
              from={OVERVIEW_ROUTE}
              to="."
              search={(previous) =>
                withoutDefaults(
                  { ...previous, secretPath, search: "" },
                  { secretPath: "/", search: "", environments: [] }
                )
              }
              title={first.name}
            >
              {first.name}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--v4-space-8)",
                  marginInlineStart: "var(--v4-space-8)",
                  verticalAlign: "middle"
                }}
              >
                {first.description && <InfoHint text={first.description} />}
                <PendingBadge type={ctx.pending?.[first.id]} />
              </span>
            </RowLink>
          </div>
        </TableCell>
        {!ctx.single &&
          ctx.environments.map((environment) => (
            <StatusCell key={environment.value} status={presenceOf(entries, environment.value)} />
          ))}
        <TableActionsCell slots={ROW_ACTION_SLOTS} onClick={stopRowClick}>
          <LazyRowActions {...rowActions} />
        </TableActionsCell>
      </ChromeRow>
    </RowContextMenu>
  );
}

function SiteLink({ site }: { site: EnvironmentOption }) {
  return (
    <Badge asChild tone="outline">
      <Link
        from={OVERVIEW_ROUTE}
        to="."
        search={(previous) =>
          withoutDefaults(
            { ...previous, environments: [site.value], search: "" },
            { secretPath: "/", search: "", environments: [] }
          )
        }
      >
        <Icon icon={LayersIcon} />
        {site.label}
      </Link>
    </Badge>
  );
}

function SiteList({ sites }: { sites: EnvironmentOption[] }) {
  return (
    <ul className={styles.importSites}>
      {sites.map((site) => (
        <li key={site.value} className={styles.importSite}>
          <SiteLink site={site} />
        </li>
      ))}
    </ul>
  );
}

function ImportedIn({ sites }: { sites: EnvironmentOption[] }) {
  const fit = useRef<HTMLSpanElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(sites.length);
  const [reserve, setReserve] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const signature = sites.map((site) => site.value).join("|");
  useLayoutEffect(() => {
    const box = fit.current;
    const ruler = measure.current;
    if (!box || !ruler) return undefined;
    const update = () => {
      const [more, ...items] = [...ruler.children].map(
        (child) => (child as HTMLElement).offsetWidth
      );
      const gap = parseFloat(getComputedStyle(ruler).columnGap) || 0;
      const space = box.clientWidth;
      setReserve(more);
      const total = items.reduce((sum, width) => sum + width + gap, -gap);
      if (total <= space) {
        setShown(items.length);
        return;
      }
      const room = space - more - gap;
      let used = -gap;
      let count = 0;
      while (count < items.length && used + gap + items[count] <= room) {
        used += gap + items[count];
        count += 1;
      }
      setShown(count);
    };
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [signature]);
  const hidden = sites.length - shown;
  return (
    <span className={styles.importedIn}>
      <span className={styles.subtle}>Imported in</span>
      <span ref={fit} className={styles.importedBadges} style={{ minWidth: reserve }}>
        {sites.slice(0, shown).map((site) => (
          <SiteLink key={site.value} site={site} />
        ))}
        {hidden > 0 && (
          <HoverCard open={cardOpen && !listOpen} onOpenChange={setCardOpen}>
            <HoverCardTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setCardOpen(false);
                  setListOpen(true);
                }}
              >
                {`+${hidden} more`}
              </Button>
            </HoverCardTrigger>
            <HoverCardContent align="start">
              <SiteList sites={sites} />
            </HoverCardContent>
          </HoverCard>
        )}
      </span>
      <span ref={measure} className={styles.importedRuler} aria-hidden="true">
        <Button variant="ghost" size="xs" tabIndex={-1}>
          {`+${sites.length} more`}
        </Button>
        {sites.map((site) => (
          <Badge key={site.value} tone="outline">
            <Icon icon={LayersIcon} />
            {site.label}
          </Badge>
        ))}
      </span>
      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{`Imported in ${sites.length} environments`}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <SiteList sites={sites} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </span>
  );
}

export function ImportRow({
  rowKey,
  entries,
  ctx,
  sourceSecrets,
  projectName,
  sites
}: {
  rowKey: string;
  entries: Of<"import">[];
  ctx: RowContext;
  sourceSecrets: (entry: Of<"import">) => Secret[];
  projectName: string;
  sites: EnvironmentOption[];
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
      <RowTooltip
        content={`Last replication ${new Date(entry.lastReplicated).toLocaleString("en-US")}${entry.replicationStatus === "failed" ? `. Fail reason: ${entry.replicationDetails ?? "unknown"}` : ""}`}
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
      </RowTooltip>
    );
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
  const rowActions: RowActionProps = {
    label: `secret import ${first.source.path}`,
    menu: ctx.single ? (
      <>
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
  const keys = ctx.single && expanded ? sourceSecrets(first) : [];
  return (
    <>
      <RowContextMenu {...rowActions}>
        <ChromeRow
          data-state={ctx.recent.includes(rowKey) ? "selected" : undefined}
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
            pinOffset="var(--v4-size-row)"
            colSpan={ctx.single ? 2 : undefined}
            className={styles.nameCell}
          >
            <div className={styles.nameLine}>
              <span className={styles.nameKind}>
                <KindIcon kind="import" />
              </span>
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
            </div>
          </TableCell>
          {!ctx.single && expanded && (
            <TableCell colSpan={ctx.environments.length} className={styles.importedInCell}>
              <ImportedIn sites={sites} />
            </TableCell>
          )}
          {!ctx.single &&
            !expanded &&
            ctx.environments.map((environment) => (
              <StatusCell key={environment.value} status={presenceOf(entries, environment.value)} />
            ))}
          <TableActionsCell slots={ROW_ACTION_SLOTS} onClick={stopRowClick}>
            {ctx.single && <LazyRowActions {...rowActions} />}
          </TableActionsCell>
        </ChromeRow>
      </RowContextMenu>
      {ctx.single && expanded && !first.revoked && (
        <TableRow className={styles.nestedHead}>
          <TableCell pin="start" selection divider={false} />
          <TableCell pin="start" pinOffset="var(--v4-size-row)" className={styles.nameCell}>
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
            <TableCell pin="start" pinOffset="var(--v4-size-row)" className={styles.nameCell}>
              <span className={styles.truncate}>{secret.name}</span>
            </TableCell>
            <TableCell colSpan={2} className={styles.valueCell}>
              <code className={styles.value}>
                {readableValue(secret) === undefined ? "No access" : mask}
              </code>
            </TableCell>
          </TableRow>
        ))}
      {ctx.single && expanded && first.revoked && (
        <TableRow className={styles.importedRow}>
          <TableCell pin="start" selection divider={false} />
          <TableCell colSpan={3} className={styles.subtle}>
            Access to this source was revoked, so its secrets are not shown.
          </TableCell>
        </TableRow>
      )}
      {!ctx.single && expanded && (
        <TableRow className={styles.nestedRow}>
          <TableCell
            pin="viewport"
            colSpan={ctx.environments.length + 3}
            className={styles.nestedCell}
          >
            <div>
              <Table className={styles.nestedTable}>
                <TableHeader>
                  <TableRow>
                    <TableHead selection divider={false} />
                    <TableHead className={styles.envName}>Name</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {first.revoked ? (
                    <TableRow>
                      <TableCell selection divider={false} />
                      <TableCell colSpan={2} className={styles.subtle}>
                        Access to this source was revoked, so its secrets are not shown.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sourceSecrets(first).map((secret) => (
                      <TableRow key={secret.id} className={styles.row}>
                        <TableCell selection divider={false} />
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
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export const kindRowKinds = Object.keys(specs) as (keyof typeof specs)[];

export const KindRow = memo(KindRowView, sameRow);
export const FolderRow = memo(FolderRowView, sameRow);
