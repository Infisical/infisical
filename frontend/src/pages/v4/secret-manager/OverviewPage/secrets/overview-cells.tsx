import {
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef
} from "react";
import { replaceEqualDeep } from "@tanstack/react-query";
import {
  BanIcon,
  ChevronsLeftRightEllipsisIcon,
  CircleIcon,
  FingerprintIcon,
  GitBranchIcon,
  HexagonIcon,
  ImportIcon,
  type LucideIcon,
  SaveIcon,
  Undo2Icon
} from "lucide-react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { Icon, type IconName } from "@app/components/v4/ui/icon";
import { type RowContextMenu, TableCell, TableHead } from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { type Resource, type ResourceKind, selectionKey } from "../secrets-model";
import type { PendingType } from "./batch/pending";
import type { useManagedBlock } from "./row-actions/permissions";
import type { RowAction } from "./row-actions/types";

import styles from "./overview.module.css";

export const NEXT_PHASE = "Ported in the next phase";
export const ROW_ACTION_SLOTS = 2;
export const stopRowClick = (event: MouseEvent) => event.stopPropagation();
export type RowActionProps = Omit<ComponentProps<typeof RowContextMenu>, "children">;
export type EnvironmentOption = { value: string; label: string };
export type RowContext = {
  environments: EnvironmentOption[];
  single: boolean;
  path: string;
  writeBlock?: string;
  blockFor?: ReturnType<typeof useManagedBlock>;
  selected: string[];
  recent: string[];
  expanded: string[];
  onExpand: (key: string, open: boolean) => void;
  onToggleSelect: (keys: string[]) => void;
  report: (message: string) => void;
  onAction: (action: RowAction) => void;
  pending?: Record<string, PendingType>;
  selectionDisabled?: boolean;
  onSavePending?: (id: string) => void;
  onRevertPending?: (id: string) => void;
};
export const sameRow = <
  P extends { rowKey: string; entries: readonly Resource[]; ctx: RowContext }
>(
  prev: P,
  next: P
) => {
  const marks = (props: P) => ({
    props: { ...props, ctx: { ...props.ctx, selected: [], expanded: [], recent: [] } },
    selected: props.entries.map((entry) => props.ctx.selected.includes(selectionKey(entry))),
    expanded: props.ctx.expanded.includes(props.rowKey),
    recent: props.ctx.recent.includes(props.rowKey)
  });
  const before = marks(prev);
  return replaceEqualDeep(before, marks(next)) === before;
};
export const useStableHandlers = <T extends Record<string, (...args: never[]) => unknown>>(
  handlers: T
): T => {
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });
  return useMemo(
    () =>
      Object.fromEntries(
        Object.keys(latest.current).map((name) => [
          name,
          (...args: never[]) => latest.current[name](...args)
        ])
      ) as T,
    []
  );
};
export type EnvironmentStatus = "present" | "missing" | "empty" | "imported" | "no-access";
type Glyph = { name?: IconName; icon?: LucideIcon };

const kindGlyphs: Record<ResourceKind, Glyph> = {
  folder: { name: "folder" },
  secret: { name: "key" },
  import: { icon: ImportIcon },
  dynamic: { icon: FingerprintIcon },
  rotation: { name: "sync" },
  honey: { icon: HexagonIcon },
  proxy: { icon: ChevronsLeftRightEllipsisIcon }
};
export type KindOverlay = "rotation" | "honey";
export function KindIcon({ kind, overlay }: { kind: ResourceKind; overlay?: KindOverlay }) {
  if (!overlay) return <Icon {...kindGlyphs[kind]} />;
  return (
    <span className={styles.overlayIcon}>
      <Icon {...kindGlyphs[kind]} />
      <span className={styles.overlayMark} data-overlay={overlay}>
        <Icon {...kindGlyphs[overlay]} size={10} />
      </span>
    </span>
  );
}

const statusMeta: Record<EnvironmentStatus, Glyph & { label: string }> = {
  present: { label: "Present in environment", name: "check" },
  missing: { label: "Missing from environment", name: "minus" },
  empty: { label: "Empty value in environment", icon: CircleIcon },
  imported: { label: "Imported into environment", icon: ImportIcon },
  "no-access": { label: "You do not have permission to view this resource", icon: BanIcon }
};
export function StatusCell({
  status,
  hasOverride,
  annotations
}: {
  status: EnvironmentStatus;
  hasOverride?: boolean;
  annotations?: ReactNode;
}) {
  const meta = statusMeta[status];
  return (
    <TableCell className={styles.statusCell} data-status={status}>
      <span className={styles.statusLine}>
        <span className={styles.statusGroup}>
          <Tooltip content={meta.label}>
            <span className={styles.statusMark}>
              <Icon name={meta.name} icon={meta.icon} label={meta.label} />
            </span>
          </Tooltip>
          {hasOverride && (
            <Tooltip content="Has personal override">
              <span className={styles.overrideMark}>
                <Icon icon={GitBranchIcon} label="Has personal override" />
              </span>
            </Tooltip>
          )}
        </span>
        {annotations}
      </span>
    </TableCell>
  );
}
export const presenceOf = (entries: Resource[], environment: string): EnvironmentStatus =>
  entries.some((entry) => entry.environment === environment) ? "present" : "missing";

export function ActionButton({
  label,
  name,
  icon,
  disabledReason,
  onClick
}: Glyph & {
  label: string;
  disabledReason?: string;
  onClick?: () => void;
}) {
  const button = (
    <Button
      variant="ghost"
      size="icon-row"
      iconOnly
      disabledReason={disabledReason}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      <Icon name={name} icon={icon} />
      <span className="sr-only">{label}</span>
    </Button>
  );
  return (
    <span className={styles.actionSlot}>
      {disabledReason ? button : <Tooltip content={label}>{button}</Tooltip>}
    </span>
  );
}

const pendingBadges = {
  create: { tone: "ok", label: "New" },
  update: { tone: "ok", label: "Modified" },
  delete: { tone: "bad", label: "Deleted" }
} as const;

export function PendingBadge({ type }: { type?: PendingType }) {
  if (!type) return null;
  const { tone, label } = pendingBadges[type];
  return (
    <Badge size="sm" tone={tone}>
      {label}
    </Badge>
  );
}

export function PendingMenuItems({
  id,
  ctx,
  saveBlock
}: {
  id: string;
  ctx: RowContext;
  saveBlock?: string;
}) {
  if (!ctx.pending?.[id]) return null;
  const block = ctx.writeBlock ?? saveBlock;
  return (
    <>
      <DropdownMenuItem
        disabled={Boolean(block)}
        description={block}
        onSelect={() => ctx.onSavePending?.(id)}
      >
        <Icon icon={SaveIcon} />
        Save pending changes
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => ctx.onRevertPending?.(id)}>
        <Icon icon={Undo2Icon} />
        Discard pending changes
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  );
}

export const selectableKinds: ResourceKind[] = ["secret", "folder", "rotation"];

const selectionState = (keys: string[], selected: string[]) => {
  const count = keys.filter((key) => selected.includes(key)).length;
  return { all: count > 0 && count === keys.length, some: count > 0 && count < keys.length };
};

function SelectionCheckbox({
  keys,
  label,
  ctx
}: {
  keys: string[];
  label: string;
  ctx: RowContext;
}) {
  const { all, some } = selectionState(keys, ctx.selected);
  return (
    <Checkbox
      aria-label={label}
      checked={all}
      indeterminate={some}
      disabled={ctx.selectionDisabled || !keys.length}
      onClick={(event) => event.stopPropagation()}
      onCheckedChange={() => ctx.onToggleSelect(keys)}
    />
  );
}

export function SelectCell({
  kind,
  keys,
  label,
  ctx,
  selectable,
  overlay
}: {
  kind: ResourceKind;
  keys: string[];
  label: string;
  ctx: RowContext;
  selectable: boolean;
  overlay?: KindOverlay;
}) {
  const { all, some } = selectionState(keys, ctx.selected);
  return (
    <TableCell selection divider={false}>
      <span
        className={styles.iconSlot}
        data-selectable={selectable || undefined}
        data-selected={all || some || undefined}
      >
        <span className={styles.kindGlyph}>
          <KindIcon kind={kind} overlay={overlay} />
        </span>
        {selectable && (
          <span className={styles.rowCheck}>
            <SelectionCheckbox keys={keys} label={`Select ${label}`} ctx={ctx} />
          </span>
        )}
      </span>
    </TableCell>
  );
}

export function ChildSelectCell({
  resource,
  label,
  ctx
}: {
  resource?: Resource;
  label: string;
  ctx: RowContext;
}) {
  if (!resource || !selectableKinds.includes(resource.kind))
    return <TableCell selection divider={false} />;
  const key = selectionKey(resource);
  return (
    <TableCell selection divider={false}>
      <span className={styles.iconSlot} data-selected={ctx.selected.includes(key) || undefined}>
        <span className={styles.rowCheck}>
          <SelectionCheckbox keys={[key]} label={`Select ${label}`} ctx={ctx} />
        </span>
      </span>
    </TableCell>
  );
}

export function ChildSelectHead({
  resources,
  label,
  ctx
}: {
  resources: Resource[];
  label: string;
  ctx: RowContext;
}) {
  const keys = resources
    .filter((resource) => selectableKinds.includes(resource.kind))
    .map(selectionKey);
  if (!keys.length) return <TableHead selection divider={false} />;
  return (
    <TableHead selection divider={false}>
      <span className={styles.iconSlot}>
        <SelectionCheckbox keys={keys} label={`Select ${label} in every environment`} ctx={ctx} />
      </span>
    </TableHead>
  );
}

export function ExpandToggle({
  expanded,
  label,
  onToggle
}: {
  expanded: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-row"
      iconOnly
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Icon name={expanded ? "chev-down" : "chev-right"} />
      <span className="sr-only">{`${expanded ? "Collapse" : "Expand"} ${label}`}</span>
    </Button>
  );
}

export function ExpandCell({
  expanded,
  label,
  onToggle
}: {
  expanded: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <TableCell selection divider={false}>
      <span className={styles.iconSlot}>
        <ExpandToggle expanded={expanded} label={label} onToggle={onToggle} />
      </span>
    </TableCell>
  );
}
